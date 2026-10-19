'use strict';

// GH-447 (D0282): a kiosk attempt that never reported a terminal result no longer locks its kiosk and
// terminal for good. When a new purchase finds the D0220 claims busy, an attempt that is still `created`,
// at least 10 minutes old and unknown to the local cache gets one ROLLER read. ROLLER's 404 records it as
// `cancelled` with its audit in one guarded statement, and the purchase takes the claims. On 2026-10-18
// Nacka K5 lost a draft response when its page reloaded and refused 16 purchases until it was switched off.
// Synthetic data only: no ROLLER, AWS, database or network call leaves this process.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const source = fs.readFileSync(bookingPath, 'utf8');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');

const profile = 'nacka-forum-kiosk-1';
const capability = 'H'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
const lockId = `kt_${'8'.repeat(32)}`;
const KEYS = [`jykb_install_${installationId}`, `jykb_terminal_${lockId}`].sort();
const CUSTOMER = { firstName: 'Test', lastName: 'Fixture', email: 'gh447@example.invalid', phone: '+46000000447' };
const ITEMS = [{ productId: 101, quantity: 1, bookingDate: '2026-10-19', startTime: '12:00' }];
const JWT = `h.${Buffer.from(JSON.stringify({ currency: 'SEK', merchantReference: 'synthetic-447' })).toString('base64url')}.s`;
const COSTS = { total: 480, amountOwing: 480 };
const OLD = {
  attemptId: `jytp_${'5'.repeat(18)}`, draftId: `jypd_${'5'.repeat(18)}`, uniqueId: 'synthetic-roller-draft-k5',
  key: 'kiosk-draft:1020:14:30:entry-4:synthetic',
};
const plain = (value) => JSON.parse(JSON.stringify(value));

function configuration() {
  return {
    env: 'live', baseUrl: 'https://api.roller.app', kioskVenueId: '50871', allowLegacyKioskTerminalAlias: false,
    kioskInstallations: contract.normalizeKioskInstallationMap({
      [installationId]: { active: true, allowedProfileIds: [profile], venueId: '50871' },
    }),
    kioskProfiles: contract.normalizeKioskProfileMap({
      [profile]: { active: true, paymentTerminalAlias: 'k5', venueId: '50871' },
    }),
    paymentTerminals: contract.normalizePaymentTerminalMap({ k5: { terminalId: 'synthetic-terminal-k5', lockId } }),
  };
}

// The claim rows, prepayment rows and local booking cache, with the semantics of the claim statements.
function claimStore() {
  const claims = new Map();
  const drafts = new Map();
  const bookings = new Set();
  const audits = [];
  const kinds = [];
  const param = (parameters, name) => {
    const value = parameters.find((p) => p.name === name)?.value;
    return value?.stringValue ?? (value?.longValue === undefined ? null : Number(value.longValue));
  };
  const rows = (records) => {
    const columns = records[0] ? Object.keys(records[0]) : [];
    return {
      columnMetadata: columns.map((name) => ({ name })),
      records: records.map((record) => columns.map((name) => (record[name] === null || record[name] === undefined
        ? { isNull: true }
        : typeof record[name] === 'number' ? { longValue: record[name] } : { stringValue: String(record[name]) }))),
    };
  };
  const definitive = (attemptId) => {
    const draft = drafts.get(attemptId);
    return Boolean(draft && (['failed', 'cancelled', 'reconciled'].includes(draft.payment_attempt_status) || draft.status === 'published'));
  };
  const localBookings = (draft) => (bookings.has(draft.roller_draft_unique_id) ? 1 : 0);
  let failHolderRead = false;
  let loseReleaseRace = false;

  async function executeStatement(sql, parameters = []) {
    if (/FROM jumpyard\.kiosk_installations/.test(sql)) return { columnMetadata: [], records: [] };
    const attemptId = param(parameters, 'attemptId');
    if (/INSERT INTO jumpyard\.idempotency_records AS existing/.test(sql)) {
      kinds.push('claim');
      const claimed = [];
      for (const key of JSON.parse(param(parameters, 'keys'))) {
        const existing = claims.get(key);
        if (!existing || existing.status === 'released' || definitive(existing.resultRef)) {
          claims.set(key, { status: 'started', resultRef: attemptId });
          claimed.push({ idempotency_key: key });
        }
      }
      return rows(claimed);
    }
    if (/FROM jumpyard\.idempotency_records AS claim/.test(sql)) {
      kinds.push('holders');
      if (failHolderRead) throw new Error('synthetic holder read failure');
      assert.match(sql, /claim\.status = 'started'/);
      const keys = JSON.parse(param(parameters, 'keys'));
      const seen = new Map();
      for (const key of keys) {
        const claim = claims.get(key);
        if (!claim || claim.status !== 'started' || seen.has(claim.resultRef)) continue;
        const draft = drafts.get(claim.resultRef);
        seen.set(claim.resultRef, draft
          ? {
              payment_attempt_id: claim.resultRef,
              prepayment_draft_id: draft.prepayment_draft_id,
              roller_draft_unique_id: draft.roller_draft_unique_id,
              idempotency_key: draft.idempotency_key,
              kiosk_installation_id: draft.kiosk_installation_id,
              payment_attempt_status: draft.payment_attempt_status,
              status: draft.status,
              flow_type: draft.flow_type,
              roller_booking_reference: draft.roller_booking_reference,
              total_cents: 48000,
              amount_owing_cents: 48000,
              age_seconds: draft.age_seconds,
              local_booking_count: localBookings(draft),
            }
          : {
              payment_attempt_id: claim.resultRef, prepayment_draft_id: null, roller_draft_unique_id: null,
              idempotency_key: null, kiosk_installation_id: null, payment_attempt_status: null, status: null, flow_type: null, roller_booking_reference: null,
              total_cents: null, amount_owing_cents: null, age_seconds: null, local_booking_count: 0,
            });
      }
      return rows([...seen.values()]);
    }
    if (/UPDATE jumpyard\.prepayment_booking_drafts AS draft/.test(sql) && /abandoned_no_payment/.test(sql)) {
      kinds.push('release_attempt');
      const draft = drafts.get(param(parameters, 'paymentAttemptId'));
      const ok = !loseReleaseRace && draft &&
        draft.prepayment_draft_id === param(parameters, 'prepaymentDraftId') &&
        draft.roller_draft_unique_id === param(parameters, 'rollerDraftUniqueId') &&
        draft.payment_attempt_status === 'created' && draft.status !== 'published' && !draft.roller_booking_reference &&
        (draft.age_seconds >= param(parameters, 'minimumAgeSeconds') || (
          param(parameters, 'unstartedDraftKey') !== null &&
          draft.idempotency_key === param(parameters, 'unstartedDraftKey') &&
          draft.kiosk_installation_id === param(parameters, 'reportingInstallationId'))) &&
        localBookings(draft) === 0;
      if (!ok) return rows([]);
      Object.assign(draft, {
        payment_attempt_status: 'cancelled', status: 'cancelled', booking_confirmation_status: 'failed',
        reconciliation_last_result: 'abandoned_no_payment',
      });
      audits.push({
        correlationId: param(parameters, 'correlationId'),
        eventId: param(parameters, 'eventId'),
        payload: JSON.parse(param(parameters, 'eventPayload')),
        subjectRef: draft.prepayment_draft_id,
      });
      return rows([{ prepayment_draft_id: draft.prepayment_draft_id }]);
    }
    if (/UPDATE jumpyard\.idempotency_records/.test(sql) && /NOT EXISTS/.test(sql)) {
      kinds.push('release_on_failure');
      const released = [];
      if (!drafts.has(attemptId)) {
        for (const [key, claim] of claims) {
          if (claim.status === 'started' && claim.resultRef === attemptId) {
            claims.set(key, { status: 'released', resultRef: null });
            released.push({ idempotency_key: key });
          }
        }
      }
      return rows(released);
    }
    if (/UPDATE jumpyard\.idempotency_records/.test(sql)) {
      kinds.push('partial_release');
      for (const [key, claim] of claims) if (claim.resultRef === attemptId) claims.set(key, { status: 'released', resultRef: null });
      return rows([]);
    }
    throw new Error(`Unexpected SQL during GH-447 validation: ${sql.slice(0, 80)}`);
  }

  // Seeds an attempt that holds both kiosk claims, as K5's did from 14:33:40 on 2026-10-18.
  function hold(extra = {}, { withDraft = true } = {}) {
    for (const key of KEYS) claims.set(key, { status: 'started', resultRef: OLD.attemptId });
    if (!withDraft) return null;
    const draft = {
      prepayment_draft_id: OLD.draftId,
      roller_draft_unique_id: OLD.uniqueId,
      payment_attempt_id: OLD.attemptId,
      idempotency_key: OLD.key,
      kiosk_installation_id: installationId,
      payment_attempt_status: 'created',
      status: 'payment_pending',
      flow_type: 'new_booking',
      booking_confirmation_status: 'pending',
      roller_booking_reference: null,
      age_seconds: 11 * 60,
      ...extra,
    };
    drafts.set(OLD.attemptId, draft);
    return draft;
  }

  return {
    audits, bookings, claims, drafts, executeStatement, hold, kinds,
    failHolderRead: () => { failHolderRead = true; },
    loseReleaseRace: () => { loseReleaseRace = true; },
  };
}

function load(overrides, logs) {
  const module = { exports: {} };
  const aws = new Proxy({}, {
    get: () => class {
      constructor(input) { this.input = input; }
      async send() { throw new Error('No AWS calls allowed in GH-447 tests'); }
    },
  });
  const record = (level) => (line) => logs.push({ level, line: String(line) });
  const sandbox = {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout, crypto, module, overrides,
    console: { log: record('log'), warn: record('warn'), info: record('info'), error: record('error') },
    exports: module.exports,
    fetch: async () => { throw new Error('No network allowed in GH-447 tests'); },
    process: { env: {} },
    require(name) {
      if (name === 'crypto' || name === 'node:crypto') return crypto;
      if (name.startsWith('@aws-sdk/')) return aws;
      if (name === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (name.startsWith('./')) return require(path.join(path.dirname(bookingPath), name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(
    `${source}\n${assignments}\nmodule.exports.__gh447 = { handleDraft, handleAddProductDraft, reserveKioskDraftBinding, ` +
      'recordKioskTerminalOutcome, releaseAbandonedKioskAttempt };',
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh447;
}

// A kiosk purchase against the store, with ROLLER's answer to GET /bookings/{draft} scripted.
function fixture({ store = claimStore(), readback = { ok: false, status: 404, body: null }, extra = {}, body: bodyExtra = {} } = {}) {
  const logs = [];
  const gets = [];
  const drafts = [];
  const backend = load({
    getRollerConfig: async () => configuration(),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic', tokenType: 'Bearer' }),
    reserveIdempotencyKey: async () => ({ ok: true }),
    completeIdempotencyKey: async () => {},
    isNewBookingDraftWriteEnabled: () => true,
    isAddProductDraftWriteEnabled: () => true,
    validateT0176FullFlowRequestItemDates: () => ({ ok: true }),
    validateT0162AddOnSmokeAccess: () => ({ ok: true }),
    validateT0176FullFlowOriginalBookingAccess: () => ({ ok: true }),
    verifyGuestAccessForBooking: async () => ({ ok: true }),
    getBookingReferenceFromPath: () => 'original-447',
    resolveOriginalBookingContext: async () => ({
      ok: true, venueId: '50871', bookingReference: 'original-447', rollerUniqueId: 'original-id', rollerCustomerId: 'guest-447',
    }),
    getRollerJson: async (_config, _token, endpoint, options = {}) => {
      if (endpoint === '/guests/guest-447') return { ok: true, status: 200, body: { ...CUSTOMER } };
      gets.push({ endpoint, expectedMissStatus: options.expectedMissStatus ?? null });
      if (readback instanceof Error) throw readback;
      return readback;
    },
    postRollerJson: async (_config, _token, endpoint) => {
      if (endpoint === '/bookings/draft/costs') return { ok: true, status: 200, body: { costs: COSTS, currency: 'SEK' } };
      if (endpoint !== '/bookings/draft') throw new Error(`Unexpected ROLLER write ${endpoint}`);
      drafts.push(endpoint);
      return { ok: true, status: 201, body: { uniqueId: `roller-draft-new-${drafts.length}`, costs: COSTS, currency: 'SEK', paymentJwt: JWT } };
    },
    executeStatement: store.executeStatement,
    capturePhoneEmailMarketing: async () => {},
    captureSafetyAttestation: async () => {},
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://example.invalid' }),
    persistPrepaymentDraft: async ({ request, draft }) => {
      const attemptId = request.reservedPaymentAttemptId;
      store.drafts.set(attemptId, {
        prepayment_draft_id: `jypd_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
        roller_draft_unique_id: draft.uniqueId, payment_attempt_id: attemptId, payment_attempt_status: 'created',
        idempotency_key: request.idempotencyKey, kiosk_installation_id: request.verifiedKioskInstallationId,
        status: 'payment_pending', flow_type: 'new_booking', roller_booking_reference: null, age_seconds: 0,
      });
      return { paymentAttemptId: attemptId, prepaymentDraftId: store.drafts.get(attemptId).prepayment_draft_id };
    },
    persistAddOnBookingLink: async () => ({}),
    writeBookingEventLog: async () => {},
    ...extra,
  }, logs);
  const body = {
    confirmDraft: true, idempotencyKey: `gh447-${crypto.randomUUID()}`, customer: { ...CUSTOMER }, items: ITEMS,
    channel: 'kiosk', kioskInstallationId: installationId, kioskCapability: capability, kioskProfileId: profile,
    ...bodyExtra,
  };
  return { backend, body, drafts, gets, logs, store };
}

const parse = (response) => JSON.parse(response.body);
const lines = (logs, level, event) => logs.filter((entry) => entry.level === level)
  .map((entry) => { try { return JSON.parse(entry.line); } catch { return {}; } })
  .filter((line) => line.event === event);
const metrics = (logs) => logs.filter((entry) => entry.level === 'log')
  .map((entry) => { try { return JSON.parse(entry.line); } catch { return {}; } })
  .filter((line) => line.KioskTerminalOutcomeCount === 1);
const claimOwners = (store) => KEYS.map((key) => store.claims.get(key)?.resultRef ?? null);

test('The rule: only a never-reported attempt, 10 minutes old, without any booking, gets a ROLLER check', () => {
  assert.equal(contract.KIOSK_ABANDONED_ATTEMPT_MIN_AGE_SECONDS, 600);
  assert.equal(contract.KIOSK_ABANDONED_ATTEMPT_MIN_AGE_SECONDS, 2 * contract.KIOSK_STAFF_NO_PAYMENT_MIN_AGE_SECONDS);
  const row = {
    prepayment_draft_id: OLD.draftId, roller_draft_unique_id: OLD.uniqueId, payment_attempt_status: 'created',
    status: 'payment_pending', roller_booking_reference: null, local_booking_count: 0, age_seconds: 600,
  };
  assert.equal(contract.kioskAbandonedAttemptCheckable(row), true);
  assert.equal(contract.kioskAbandonedAttemptCheckable({ ...row, local_booking_count: '0', age_seconds: '601' }), true);
  for (const [name, change] of [
    ['younger than 10 minutes', { age_seconds: 599 }],
    ['an unknown result', { payment_attempt_status: 'unknown' }],
    ['an approval', { payment_attempt_status: 'approved' }],
    ['a recorded failure', { payment_attempt_status: 'failed' }],
    ['a published draft', { status: 'published' }],
    ['a booking reference', { roller_booking_reference: '171849053' }],
    ['a booking in the local cache', { local_booking_count: 1 }],
    ['no prepayment row', { prepayment_draft_id: null }],
    ['no ROLLER draft id', { roller_draft_unique_id: null }],
    ['no age', { age_seconds: null }],
  ]) {
    assert.equal(contract.kioskAbandonedAttemptCheckable({ ...row, ...change }), false, name);
  }
  assert.equal(contract.kioskAbandonedAttemptCheckable(null), false);
  // The kiosk's own report that the payment never started waives the age, never the other conditions.
  assert.equal(contract.kioskAbandonedAttemptCheckable({ ...row, age_seconds: 4 }, { reportedUnstarted: true }), true);
  for (const change of [{ payment_attempt_status: 'unknown' }, { local_booking_count: 1 }, { status: 'published' }]) {
    assert.equal(contract.kioskAbandonedAttemptCheckable({ ...row, ...change, age_seconds: 4 }, { reportedUnstarted: true }), false);
  }
});

test('The kiosk may report at most three of its own draft keys; anything else is ignored', () => {
  const normalize = contract.normalizeKioskUnstartedDraftKeys;
  assert.deepEqual(normalize(undefined), []);
  assert.deepEqual(normalize('kiosk-draft:1'), []);
  assert.deepEqual(normalize([OLD.key, OLD.key, 'kiosk-retry-draft:1:2', 'with space', '', 7, 'x'.repeat(201)]),
    [OLD.key, 'kiosk-retry-draft:1:2']);
  assert.deepEqual(normalize(['a', 'b', 'c', 'd']), ['a', 'b', 'c']);
});

for (const method of ['handleDraft', 'handleAddProductDraft']) {
  test(`${method}: K5's abandoned attempt gives the next purchase its claims after ROLLER's 404`, async () => {
    const f = fixture();
    const old = f.store.hold();
    const response = await f.backend[method]({}, f.body, 'gh447-corr');
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(f.gets, [{ endpoint: `/bookings/${OLD.uniqueId}`, expectedMissStatus: 404 }],
      'one ROLLER read for the old draft, counted as an expected miss');
    assert.deepEqual(f.store.kinds, ['claim', 'partial_release', 'holders', 'release_attempt', 'claim']);
    assert.equal(old.payment_attempt_status, 'cancelled');
    assert.equal(old.status, 'cancelled');
    assert.equal(old.reconciliation_last_result, 'abandoned_no_payment');
    const newAttempt = claimOwners(f.store)[0];
    assert.match(newAttempt, /^jytp_[a-f0-9]{18}$/);
    assert.notEqual(newAttempt, OLD.attemptId);
    assert.deepEqual(claimOwners(f.store), [newAttempt, newAttempt], 'both claims belong to the new attempt');
    assert.equal(f.drafts.length, 1);

    assert.equal(f.store.audits.length, 1);
    const [audit] = f.store.audits;
    assert.equal(audit.subjectRef, OLD.draftId);
    assert.equal(audit.correlationId, 'gh447-corr');
    assert.match(audit.eventId, /^evt_[a-f0-9]{64}$/);
    assert.deepEqual(audit.payload, {
      ageSeconds: 660, attemptStatusBefore: 'created', flowType: 'new_booking', reportedUnstarted: false, result: 'released',
      roller: { booking: 'not_found', httpStatus: 404 },
    });
    assert.ok(!JSON.stringify(audit).includes(CUSTOMER.email), 'the audit carries no guest data');

    const [busy] = lines(f.logs, 'warn', 'kiosk_payment_busy');
    assert.equal(busy.releasedCount, 1);
    assert.deepEqual(busy.holders, [{
      ageSeconds: 660, attemptStatus: 'created', paymentAttemptId: OLD.attemptId, released: true, reportedUnstarted: false,
      rollerBooking: 'not_found',
    }]);
    assert.deepEqual(metrics(f.logs).map((line) => line.Outcome), ['abandoned']);
  });
}

for (const [name, setup] of [
  ['the attempt is 9 minutes old', (store) => store.hold({ age_seconds: 9 * 60 })],
  ['the kiosk reported an unknown result', (store) => store.hold({ payment_attempt_status: 'unknown' })],
  ['the kiosk reported an approval', (store) => store.hold({ payment_attempt_status: 'approved' })],
  ['ROLLER already gave a booking reference', (store) => store.hold({ roller_booking_reference: '171849053' })],
  ['the local cache knows a booking for the draft', (store) => { store.hold(); store.bookings.add(OLD.uniqueId); }],
  ['the claims have no prepayment row (D0220 keeps them without provider evidence)', (store) => store.hold({}, { withDraft: false })],
]) {
  test(`The kiosk stays busy without a ROLLER call when ${name}`, async () => {
    const f = fixture();
    setup(f.store);
    const before = plain([...f.store.drafts.values()]);
    const response = await f.backend.handleDraft({}, f.body, 'gh447-corr');
    assert.equal(response.statusCode, 409);
    assert.equal(parse(response).error.code, 'kiosk_payment_busy');
    assert.deepEqual(f.gets, []);
    assert.equal(f.drafts.length, 0);
    assert.deepEqual(plain([...f.store.drafts.values()]), before);
    assert.deepEqual(claimOwners(f.store), [OLD.attemptId, OLD.attemptId]);
    assert.equal(f.store.audits.length, 0);
    assert.equal(lines(f.logs, 'warn', 'kiosk_payment_busy')[0].releasedCount, 0);
  });
}

for (const [name, readback, booking] of [
  ['a paid booking', { ok: true, status: 200, body: {
    uniqueId: OLD.uniqueId, bookingReference: '171849053', paymentStatus: 'Paid', costs: { amountOwing: 0 },
    items: [{ productId: '101', tickets: [{ ticketId: 'synthetic-ticket' }] }],
  } }, 'paid'],
  ['an unpaid booking', { ok: true, status: 200, body: { uniqueId: OLD.uniqueId, bookingReference: '171849054', costs: { amountOwing: 480 } } }, 'unpaid'],
  ['a server error', { ok: false, status: 500, body: null }, 'unavailable'],
  ['a rate limit', { ok: false, status: 429, body: null }, 'unavailable'],
  ['a lost connection', new TypeError('fetch failed'), 'unavailable'],
]) {
  test(`ROLLER answering with ${name} keeps the kiosk busy and changes nothing`, async () => {
    const f = fixture({ readback });
    const old = f.store.hold();
    const response = await f.backend.handleDraft({}, f.body, 'gh447-corr');
    assert.equal(response.statusCode, 409);
    assert.equal(parse(response).error.code, 'kiosk_payment_busy');
    assert.equal(f.gets.length, 1);
    assert.equal(old.payment_attempt_status, 'created');
    assert.deepEqual(claimOwners(f.store), [OLD.attemptId, OLD.attemptId]);
    assert.equal(f.store.audits.length, 0);
    assert.ok(!f.store.kinds.includes('release_attempt'));
    assert.equal(lines(f.logs, 'warn', 'kiosk_payment_busy')[0].holders[0].rollerBooking, booking);
  });
}

test('A release that loses its race to a late result or booking keeps the kiosk busy', async () => {
  const f = fixture();
  f.store.hold();
  f.store.loseReleaseRace();
  const response = await f.backend.handleDraft({}, f.body, 'gh447-corr');
  assert.equal(response.statusCode, 409);
  assert.equal(parse(response).error.code, 'kiosk_payment_busy');
  assert.deepEqual(f.store.kinds, ['claim', 'partial_release', 'holders', 'release_attempt'], 'no second claim without a release');
  assert.equal(f.store.audits.length, 0);
});

test('A failing read is logged and keeps the kiosk busy (fail closed)', async () => {
  const f = fixture();
  f.store.hold();
  f.store.failHolderRead();
  const response = await f.backend.handleDraft({}, f.body, 'gh447-corr');
  assert.equal(response.statusCode, 409);
  assert.equal(parse(response).error.code, 'kiosk_payment_busy');
  assert.deepEqual(f.gets, []);
  assert.ok(f.logs.some((entry) => entry.level === 'error' && entry.line.includes('booking.kiosk_abandoned_release_failed')));
});

test('Kiosk #134: a draft the kiosk reports as never started is released at once after ROLLER\'s 404', async () => {
  const f = fixture({ body: { unstartedDraftKeys: [OLD.key] } });
  const old = f.store.hold({ age_seconds: 70 });
  const response = await f.backend.handleDraft({}, f.body, 'gh447-corr');
  assert.equal(response.statusCode, 201, response.body);
  assert.deepEqual(f.gets, [{ endpoint: `/bookings/${OLD.uniqueId}`, expectedMissStatus: 404 }]);
  assert.equal(old.payment_attempt_status, 'cancelled');
  assert.equal(f.store.audits[0].payload.reportedUnstarted, true);
  assert.equal(lines(f.logs, 'warn', 'kiosk_payment_busy')[0].holders[0].reportedUnstarted, true);
});

for (const [name, setup, body] of [
  ['another kiosk reports the key', (store) => store.hold({ age_seconds: 70, kiosk_installation_id: `ki_${'0'.repeat(24)}` }), { unstartedDraftKeys: [OLD.key] }],
  ['the kiosk reports a different key', (store) => store.hold({ age_seconds: 70 }), { unstartedDraftKeys: ['kiosk-draft:other'] }],
  ['the reported attempt reached the terminal (unknown)', (store) => store.hold({ age_seconds: 70, payment_attempt_status: 'unknown' }), { unstartedDraftKeys: [OLD.key] }],
]) {
  test(`A young attempt stays busy without a ROLLER call when ${name}`, async () => {
    const f = fixture({ body });
    const old = setup(f.store);
    const response = await f.backend.handleDraft({}, f.body, 'gh447-corr');
    assert.equal(response.statusCode, 409);
    assert.equal(parse(response).error.code, 'kiosk_payment_busy');
    assert.deepEqual(f.gets, []);
    assert.notEqual(old.payment_attempt_status, 'cancelled');
  });
}

test('A reported draft that ROLLER knows stays with staff, and the add-on path takes reports too', async () => {
  const known = fixture({ body: { unstartedDraftKeys: [OLD.key] }, readback: { ok: true, status: 200, body: { uniqueId: OLD.uniqueId, costs: { amountOwing: 480 } } } });
  known.store.hold({ age_seconds: 70 });
  assert.equal((await known.backend.handleDraft({}, known.body, 'gh447-corr')).statusCode, 409);
  assert.equal(known.store.audits.length, 0);

  const addOn = fixture({ body: { unstartedDraftKeys: [OLD.key] } });
  addOn.store.hold({ age_seconds: 70 });
  assert.equal((await addOn.backend.handleAddProductDraft({}, addOn.body, 'gh447-corr')).statusCode, 201);
  assert.equal(addOn.store.audits[0].payload.reportedUnstarted, true);
});

test('The purchase after a release holds the kiosk again, and a third purchase is busy without a ROLLER call', async () => {
  const store = claimStore();
  store.hold();
  const first = fixture({ store });
  assert.equal((await first.backend.handleDraft({}, first.body, 'gh447-first')).statusCode, 201);
  const second = fixture({ store });
  const busy = await second.backend.handleDraft({}, second.body, 'gh447-second');
  assert.equal(busy.statusCode, 409);
  assert.equal(parse(busy).error.code, 'kiosk_payment_busy');
  assert.deepEqual(second.gets, [], 'the new attempt is minutes old, so ROLLER is not asked');
});

test('Callers without a configuration (pairing, older tests) keep the plain D0220 answer', async () => {
  const f = fixture();
  f.store.hold();
  const request = { idempotencyKey: 'gh447-plain' };
  const error = await f.backend.reserveKioskDraftBinding({ reservationKeys: KEYS }, request);
  assert.equal(error.code, 'kiosk_payment_busy');
  assert.deepEqual(f.store.kinds, ['claim', 'partial_release']);
});

test('The guarded statement re-checks every condition and writes its audit without reading it back', () => {
  const start = source.indexOf('async function releaseAbandonedKioskAttempt(');
  const statement = source.slice(start, source.indexOf('\nasync function ', start + 10));
  for (const guard of [
    /draft\.payment_attempt_status = 'created'/,
    /draft\.status <> 'published'/,
    /draft\.roller_booking_reference IS NULL/,
    /draft\.payment_channel = 'card_present'/,
    /draft\.roller_draft_unique_id = :rollerDraftUniqueId/,
    /draft\.created_at <= now\(\) - \(CAST\(:minimumAgeSeconds AS integer\) \* interval '1 second'\)\s+OR \(draft\.idempotency_key = :unstartedDraftKey AND draft\.kiosk_installation_id = :reportingInstallationId\)/,
    /NOT EXISTS \(\s*SELECT 1\s*FROM jumpyard\.roller_bookings AS booking/,
    /integerParameter\('minimumAgeSeconds', KIOSK_ABANDONED_ATTEMPT_MIN_AGE_SECONDS\)/,
    /'booking\.kiosk_abandoned_attempt_released'/,
  ]) assert.match(statement, guard);
  const audit = statement.slice(statement.indexOf('INSERT INTO jumpyard.event_log'));
  assert.doesNotMatch(audit.slice(0, audit.indexOf('SELECT updated_draft.prepayment_draft_id')), /RETURNING/);
  assert.doesNotMatch(statement, /UPDATE jumpyard\.idempotency_records/, 'no claim row is forced; the outcome frees it');
});

// --- PostgreSQL ---------------------------------------------------------------------------------

test('PostgreSQL: the release frees both claims once, races safely and never loses a late approval', {
  skip: process.env.GH447_DATABASE_TEST !== 'true',
}, async () => {
  const { Pool } = require('../infra/node_modules/pg');
  const port = Number(process.env.GH447_PGPORT || 55447);
  assert.ok([55447, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const connection = { host: '127.0.0.1', port, database: 'jumpyard_cloud',
    user: port === 55447 ? 'gh447_test' : 'gh345_test', password: '', ssl: false };
  const admin = new Pool(connection);
  const runtime = new Pool({ ...connection, max: 8, options: '-c role=jumpyard_booking_runtime' });
  const prefix = `gh447_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const executeStatement = async (sql, parameters = []) => {
    const indexes = new Map(parameters.map((p, i) => [p.name, i + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (m, name) => indexes.has(name) ? `$${indexes.get(name)}` : m);
    const result = await runtime.query(prepared, parameters.map((p) => p.value.stringValue ?? p.value.longValue ?? null));
    return { columnMetadata: result.fields.map((f) => ({ name: f.name })),
      records: result.rows.map((r) => result.fields.map((f) => (r[f.name] === null ? { isNull: true } : { stringValue: String(r[f.name]) }))) };
  };
  const gets = [];
  const backend = load({
    executeStatement,
    completeIdempotencyKey: async () => {},
    getRollerAccessToken: async () => ({ accessToken: 'synthetic', tokenType: 'Bearer' }),
    getRollerJson: async (_config, _token, endpoint) => { gets.push(endpoint); return { ok: false, status: 404, body: null }; },
    emitKioskTerminalOutcomeMetric: () => {},
  }, []);
  const config = configuration();
  const created = [];
  const insertDraft = async (suffix, { status = 'created', ageMinutes = 11 } = {}) => {
    const hash = (value) => crypto.createHash('sha256').update(prefix + suffix + value).digest('hex').slice(0, 18);
    const attempt = { prepaymentDraftId: `jypd_${hash('draft')}`, paymentAttemptId: `jytp_${hash('attempt')}`,
      rollerDraftUniqueId: `${prefix}-${suffix}` };
    created.push(attempt.prepaymentDraftId);
    await admin.query(`INSERT INTO jumpyard.prepayment_booking_drafts
      (prepayment_draft_id, roller_draft_unique_id, external_id, idempotency_key, roller_env, flow_type, payment_channel,
       payment_attempt_id, payment_attempt_status, status, booking_confirmation_status, kiosk_installation_id,
       amount_owing_cents, total_cents, created_at)
      VALUES ($1, $2, $3, $1, 'playground', 'new_booking', 'card_present', $4, $5, 'payment_pending', 'pending', $6,
              48000, 48000, now() - make_interval(mins => $7))`,
    [attempt.prepaymentDraftId, attempt.rollerDraftUniqueId, `JY-D-${prefix}-${suffix}`, attempt.paymentAttemptId,
      status, installationId, ageMinutes]);
    return attempt;
  };
  const holdKeys = async (keys, attempt) => admin.query(`INSERT INTO jumpyard.idempotency_records
      (idempotency_key, operation, request_hash, status, result_ref, expires_at)
    SELECT key, 'kiosk_terminal_binding', $1, 'started', $1, 'infinity' FROM unnest($2::text[]) AS key
    ON CONFLICT (idempotency_key) DO UPDATE SET status = 'started', result_ref = EXCLUDED.result_ref`,
  [attempt.paymentAttemptId, keys]);
  const keysFor = (name) => [`jykb_install_${prefix}_${name}`, `jykb_terminal_${prefix}_${name}`].sort();
  const reserve = async (keys, name, { installation = null, unstartedDraftKeys = [] } = {}) => {
    const request = { idempotencyKey: `${prefix}-${name}`, unstartedDraftKeys };
    const error = await backend.reserveKioskDraftBinding({ installationId: installation, reservationKeys: keys }, request,
      { config, correlationId: `${prefix}-${name}` });
    return { error, attempt: request.reservedPaymentAttemptId ?? null };
  };
  const stored = async (attempt) => (await admin.query(`SELECT payment_attempt_status, status, reconciliation_last_result
    FROM jumpyard.prepayment_booking_drafts WHERE payment_attempt_id = $1`, [attempt.paymentAttemptId])).rows[0];
  const audits = async (attempt) => Number((await admin.query(`SELECT count(*) FROM jumpyard.event_log
    WHERE event_type = 'booking.kiosk_abandoned_attempt_released' AND subject_ref = $1`, [attempt.prepaymentDraftId])).rows[0].count);
  const owners = async (keys) => (await admin.query(`SELECT result_ref FROM jumpyard.idempotency_records
    WHERE idempotency_key = ANY($1) ORDER BY idempotency_key`, [keys])).rows.map((row) => row.result_ref);
  try {
    // K5: the abandoned attempt is released, audited once, and the new purchase holds both claims.
    const k5 = keysFor('k5');
    const abandoned = await insertDraft('abandoned');
    await holdKeys(k5, abandoned);
    const taken = await reserve(k5, 'next');
    assert.equal(taken.error, null);
    assert.deepEqual(await stored(abandoned), {
      payment_attempt_status: 'cancelled', status: 'cancelled', reconciliation_last_result: 'abandoned_no_payment' });
    assert.equal(await audits(abandoned), 1);
    assert.deepEqual(await owners(k5), [taken.attempt, taken.attempt]);
    assert.equal(await backend.releaseAbandonedKioskAttempt({ prepayment_draft_id: abandoned.prepaymentDraftId,
      payment_attempt_id: abandoned.paymentAttemptId, roller_draft_unique_id: abandoned.rollerDraftUniqueId },
    `${prefix}-again`, { result: 'released' }), false, 'a second release is a no-op');

    // The statement enforces every guard, even when asked directly.
    for (const [name, setup] of [
      ['recent', async () => insertDraft('recent', { ageMinutes: 5 })],
      ['unknown', async () => insertDraft('unknown', { status: 'unknown' })],
      ['booked', async () => {
        const attempt = await insertDraft('booked');
        await admin.query(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, normalized_summary)
          VALUES ($1, $1, 'playground', '{}'::jsonb)`, [attempt.rollerDraftUniqueId]);
        return attempt;
      }],
    ]) {
      const attempt = await setup();
      assert.equal(await backend.releaseAbandonedKioskAttempt({ prepayment_draft_id: attempt.prepaymentDraftId,
        payment_attempt_id: attempt.paymentAttemptId, roller_draft_unique_id: attempt.rollerDraftUniqueId },
      `${prefix}-${name}`, { result: 'released' }), false, name);
      assert.notEqual((await stored(attempt)).payment_attempt_status, 'cancelled', name);
      const keys = keysFor(name);
      await holdKeys(keys, attempt);
      assert.equal((await reserve(keys, `${name}-busy`)).error.code, 'kiosk_payment_busy', name);
    }

    // Kiosk #134: the kiosk's own report releases a one-minute-old attempt; another kiosk's report does not.
    const reportedKeys = keysFor('reported');
    const young = await insertDraft('reported', { ageMinutes: 1 });
    await holdKeys(reportedKeys, young);
    const unstartedDraftKeys = [young.prepaymentDraftId]; // insertDraft stores the draft id as its request key
    assert.equal((await reserve(reportedKeys, 'reported-other', { installation: `ki_${'0'.repeat(24)}`, unstartedDraftKeys }))
      .error.code, 'kiosk_payment_busy');
    assert.equal((await reserve(reportedKeys, 'reported-unreported', { installation: installationId })).error.code, 'kiosk_payment_busy');
    assert.equal((await stored(young)).payment_attempt_status, 'created');
    const reportedNext = await reserve(reportedKeys, 'reported-own', { installation: installationId, unstartedDraftKeys });
    assert.equal(reportedNext.error, null);
    assert.equal((await stored(young)).payment_attempt_status, 'cancelled');
    assert.equal(await audits(young), 1);

    // Two purchases race for one abandoned kiosk: one release, one audit, one winner.
    const raced = keysFor('race');
    const racedAttempt = await insertDraft('race');
    await holdKeys(raced, racedAttempt);
    const results = await Promise.all([reserve(raced, 'race-a'), reserve(raced, 'race-b')]);
    assert.equal(results.filter((result) => result.error === null).length, 1);
    assert.equal(results.filter((result) => result.error?.code === 'kiosk_payment_busy').length, 1);
    assert.equal(await audits(racedAttempt), 1);
    const winner = results.find((result) => result.error === null).attempt;
    assert.deepEqual(await owners(raced), [winner, winner]);

    // A late approval before the release keeps the kiosk busy; after the release it is still recorded.
    const early = await insertDraft('late-before');
    await backend.recordKioskTerminalOutcome(early, 'approved');
    const earlyKeys = keysFor('late-before');
    await holdKeys(earlyKeys, early);
    assert.equal((await reserve(earlyKeys, 'late-before-busy')).error.code, 'kiosk_payment_busy');
    assert.equal((await stored(early)).payment_attempt_status, 'approved');
    const late = await insertDraft('late-after');
    const lateKeys = keysFor('late-after');
    await holdKeys(lateKeys, late);
    assert.equal((await reserve(lateKeys, 'late-after-next')).error, null);
    await backend.recordKioskTerminalOutcome(late, 'approved');
    assert.equal((await stored(late)).payment_attempt_status, 'approved', 'a payment that did happen is never lost');
    assert.ok(gets.every((endpoint) => endpoint.startsWith(`/bookings/${prefix}-`)));
  } finally {
    await admin.query('DELETE FROM jumpyard.event_log WHERE subject_ref = ANY($1)', [created]);
    await admin.query('DELETE FROM jumpyard.roller_bookings WHERE roller_unique_id LIKE $1', [`${prefix}%`]);
    await admin.query('DELETE FROM jumpyard.idempotency_records WHERE idempotency_key LIKE $1', [`jykb_%${prefix}%`]);
    await admin.query('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = ANY($1)', [created]);
    await runtime.end(); await admin.end();
  }
});
