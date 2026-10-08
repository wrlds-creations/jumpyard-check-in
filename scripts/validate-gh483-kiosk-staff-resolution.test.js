// GH-483 (D0239): a staff operator resolves one uncertain kiosk payment at the kiosk. The Session
// Lambda proves the person with their PIN (no session, shared limiter); the Booking Lambda checks
// ROLLER once per request and only then records "no payment" or attaches a paid booking.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');
const bookingSource = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const sessionSource = fs.readFileSync(path.join(root, 'infra/lambda/session/index.js'), 'utf8');
const capability = 'C'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
const draftUniqueId = 'synthetic-draft-uuid';
const prepaymentDraftId = `jypd_${'1'.repeat(18)}`;
const paymentAttemptId = `jytp_${'2'.repeat(18)}`;
const staffPin = '482951';
const pepper = 'gh483-independent-pin-pepper-0123456789abcdef';
const plain = (value) => JSON.parse(JSON.stringify(value));

const kioskConfig = () => ({
  env: 'playground', kioskVenueId: '50871', allowLegacyKioskTerminalAlias: false,
  kioskInstallations: contract.normalizeKioskInstallationMap({
    [installationId]: { active: true, allowedProfileIds: ['nacka-forum-kiosk-2'], venueId: '50871' },
  }),
  kioskProfiles: contract.normalizeKioskProfileMap({
    'nacka-forum-kiosk-2': { active: true, paymentTerminalAlias: 'primary', venueId: '50871' },
  }),
  paymentTerminals: contract.normalizePaymentTerminalMap({
    primary: { terminalId: 'synthetic-terminal', deviceId: 'synthetic-device', lockId: `kt_${'4'.repeat(32)}` },
    'nacka-t2': { terminalId: 'synthetic-p630', lockId: `kt_${'5'.repeat(32)}`, displayName: 'Nacka T2' },
  }),
  // GH-488 (D0243): a paired kiosk is named by Cloud and sends no native profile.
  kioskNames: contract.normalizeKioskNameMap({
    'nacka-k2': { active: true, displayName: 'Nacka K2', kind: 'operational', paymentTerminalAlias: 'nacka-t2', venueId: '50871' },
  }),
});
const nackaK2Pairing = { installationId, kioskNameId: 'nacka-k2', status: 'active', venueId: '50871' };

const confirmedBooking = (extra = {}) => ({
  uniqueId: draftUniqueId,
  bookingReference: '171849053',
  paymentStatus: 'Paid',
  costs: { amountOwing: 0 },
  items: [{ productId: '101', tickets: [{ ticketId: 'synthetic-ticket' }] }],
  ...extra,
});

function attemptRow(extra = {}) {
  return {
    prepayment_draft_id: prepaymentDraftId,
    roller_draft_unique_id: draftUniqueId,
    payment_attempt_id: paymentAttemptId,
    payment_attempt_status: 'unknown',
    status: 'payment_pending',
    flow_type: 'new_booking',
    booking_confirmation_status: 'needs_staff',
    roller_booking_reference: null,
    roller_env: 'playground',
    total_cents: 20000,
    amount_owing_cents: 20000,
    currency: 'SEK',
    customer_first_name: 'Synthetic',
    customer_last_name: 'Guest',
    age_seconds: 420,
    local_booking_count: 0,
    ...extra,
  };
}

function loadBooking(overrides = {}) {
  const module = { exports: {} };
  const fakeAws = new Proxy({}, { get: () => class {
    constructor(input) { this.input = input; }
    async send() { throw new Error('No AWS calls allowed in GH483 booking tests'); }
  } });
  const sandbox = { Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, crypto, module,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, process: { env: {} }, setTimeout, clearTimeout, overrides,
    fetch: () => { throw new Error('No network allowed'); },
    require(name) {
      if (name.startsWith('@aws-sdk/')) return fakeAws;
      if (name === 'crypto') return crypto;
      if (name === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (name === './package-contents') return require('../infra/lambda/shared/package-contents');
      if (name.startsWith('./')) return require(path.join(root, 'infra/lambda/booking', name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(bookingSource + '\n' + Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n') +
    '\nmodule.exports.tests = { handler: exports.handler, handleKioskStaffResolution, releaseKioskAttemptWithoutPayment, findKioskStaffResolutionAttempt, reserveKioskDraftBinding };', sandbox);
  return module.exports.tests;
}

// One staff request against a scripted attempt and ROLLER answer.
function bookingFixture({ row = attemptRow(), readback = { ok: false, status: 404, body: null }, release = true,
  confirm = { attached_session_count: 1, attached_token_count: 1 }, pairing = null } = {}) {
  const calls = { gets: [], releases: [], audits: [], updates: [], handoffs: 0, snapshots: 0, confirmations: 0, needsStaff: [] };
  const backend = loadBooking({
    getRollerConfig: async () => kioskConfig(),
    readKioskPairing: async () => (pairing ? { ...pairing } : null),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic-access' }),
    getRollerJson: async (_config, _token, endpoint) => {
      calls.gets.push(endpoint);
      if (readback instanceof Error) throw readback;
      return readback;
    },
    findKioskStaffResolutionAttempt: async (_request, verifiedInstallation) => {
      assert.equal(verifiedInstallation, installationId);
      return row ? { ...row } : null;
    },
    releaseKioskAttemptWithoutPayment: async (request, verifiedInstallation, _correlationId, audit) => {
      calls.releases.push({ request: plain(request), verifiedInstallation, audit: plain(audit) });
      if (release) row.payment_attempt_status = 'failed';
      return release;
    },
    executeStatement: async (sql) => { calls.updates.push(String(sql)); return { records: [], columnMetadata: [] }; },
    ensureProvisionalKioskHandoff: async () => { calls.handoffs += 1; return 'jycs_synthetic'; },
    persistKioskReconciliationBookingSnapshot: async () => { calls.snapshots += 1; },
    confirmKioskReconciliation: async () => { calls.confirmations += 1; return confirm; },
    confirmKioskAddProductReconciliation: async () => { calls.confirmations += 1; return { add_on_group_id: 'jyao_synthetic' }; },
    markKioskReconciliationNeedsStaff: async (_request, reason) => { calls.needsStaff.push(reason); },
    findKioskPrepaymentAttempt: async () => ({ ...row, payment_attempt_status: 'reconciled', status: 'published',
      booking_confirmation_status: 'confirmed', roller_booking_reference: '171849053' }),
    writeBookingEventLog: async (entry) => { calls.audits.push(plain(entry)); },
    emitKioskTerminalOutcomeMetric: () => {},
  });
  const run = (action, extra = {}) => backend.handleKioskStaffResolution({
    action, prepaymentDraftId, paymentAttemptId, rollerDraftUniqueId: draftUniqueId,
    kioskInstallationId: installationId, kioskProfileId: 'nacka-forum-kiosk-2', kioskCapability: capability,
    staffIdentityId: 'jystaff_synthetic', correlationId: 'gh483-test', ...extra,
  }, 'gh483-test');
  return { calls, run, row };
}

// --- Contract helpers -------------------------------------------------------------------------

test('ROLLER evidence: only a 404 means no booking; errors and unclear answers never do', () => {
  const classify = (result) => contract.classifyKioskStaffRollerEvidence(result, { expectedOwingCents: 20000, requireTickets: true }).booking;
  assert.equal(classify({ status: 404, ok: false }), 'not_found');
  assert.equal(classify({ transportError: true }), 'unavailable');
  assert.equal(classify({ status: 500, ok: false }), 'unavailable');
  assert.equal(classify({ status: 401, ok: false }), 'unavailable');
  assert.equal(classify({ status: 200, ok: true, body: confirmedBooking() }), 'paid');
  assert.equal(classify({ status: 200, ok: true, body: confirmedBooking({ costs: { amountOwing: 200 } }) }), 'unpaid');
  assert.equal(classify({ status: 200, ok: true, body: confirmedBooking({ costs: { amountOwing: 50 } }) }), 'partially_paid');
  assert.equal(classify({ status: 200, ok: true, body: confirmedBooking({ items: [] }) }), 'unconfirmed');
  assert.equal(classify({ status: 200, ok: true, body: confirmedBooking({ paymentStatus: 'Pending' }) }), 'unconfirmed');
});

test('Eligibility: "no payment" needs an unresolved attempt, an empty ROLLER answer and cache, and the minimum age', () => {
  const notFound = { booking: 'not_found' };
  const eligible = contract.kioskStaffResolutionEligibility(attemptRow(), notFound);
  assert.equal(eligible.noPayment, true);
  assert.equal(eligible.paid, false);

  const early = contract.kioskStaffResolutionEligibility(attemptRow({ age_seconds: 100 }), notFound);
  assert.equal(early.noPayment, false);
  assert.equal(early.noPaymentAvailableInSeconds, contract.KIOSK_STAFF_NO_PAYMENT_MIN_AGE_SECONDS - 100);

  for (const row of [
    attemptRow({ local_booking_count: 1 }),
    attemptRow({ status: 'published' }),
    attemptRow({ roller_booking_reference: '171849053' }),
    attemptRow({ payment_attempt_status: 'approved' }),
    attemptRow({ payment_attempt_status: 'failed' }),
    attemptRow({ payment_attempt_status: 'reconciled' }),
  ]) {
    assert.equal(contract.kioskStaffResolutionEligibility(row, notFound).noPayment, false, JSON.stringify(row));
  }
  for (const booking of ['paid', 'unpaid', 'partially_paid', 'unconfirmed', 'unavailable']) {
    assert.equal(contract.kioskStaffResolutionEligibility(attemptRow(), { booking }).noPayment, false, booking);
  }
});

test('Eligibility: "paid" needs a confirmed ROLLER booking; an approval that ran out of time qualifies', () => {
  const paid = { booking: 'paid' };
  assert.equal(contract.kioskStaffResolutionEligibility(attemptRow(), paid).paid, true);
  assert.equal(contract.kioskStaffResolutionEligibility(attemptRow({ payment_attempt_status: 'created' }), paid).paid, true);
  assert.equal(contract.kioskStaffResolutionEligibility(attemptRow({
    payment_attempt_status: 'approved', booking_confirmation_status: 'needs_staff' }), paid).paid, true);
  assert.equal(contract.kioskStaffResolutionEligibility(attemptRow({
    payment_attempt_status: 'approved', booking_confirmation_status: 'pending' }), paid).paid, false,
  'a running reconciliation is never overtaken');
  assert.equal(contract.kioskStaffResolutionEligibility(attemptRow({ payment_attempt_status: 'reconciled' }), paid).paid, false);
  assert.equal(contract.kioskStaffResolutionEligibility(attemptRow(), { booking: 'unpaid' }).paid, false);
});

test('The staff view carries no guest, staff, terminal or provider identifiers', () => {
  const row = attemptRow({ terminal_transaction_ref: 'PSP4817OK0000001', kiosk_installation_id: installationId });
  const evidence = { booking: 'not_found', amountOwingCents: null };
  const view = contract.publicKioskStaffResolution(row, evidence, contract.kioskStaffResolutionEligibility(row, evidence));
  assert.deepEqual(plain(view), {
    attempt: { ageSeconds: 420, currency: 'SEK', flowType: 'new_booking', state: 'needs_staff', totalCents: 20000 },
    roller: { amountOwingCents: null, booking: 'not_found' },
    actions: { noPayment: true, noPaymentAvailableInSeconds: 0, paid: false },
  });
  const text = JSON.stringify(view);
  for (const secret of ['Synthetic', 'Guest', draftUniqueId, prepaymentDraftId, paymentAttemptId, installationId, 'PSP4817']) {
    assert.ok(!text.includes(secret), secret);
  }
});

// --- Booking Lambda -------------------------------------------------------------------------

test('Inspect reads ROLLER once for the draft, writes nothing but the audit, and names the staff member', async () => {
  const { calls, run } = bookingFixture();
  const result = plain(await run('inspect'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'inspected');
  assert.deepEqual(result.body.actions, { noPayment: true, noPaymentAvailableInSeconds: 0, paid: false });
  assert.deepEqual(calls.gets, [`/bookings/${draftUniqueId}`]);
  assert.equal(calls.releases.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].eventType, 'booking.kiosk_staff_resolution');
  assert.equal(calls.audits[0].payload.staffIdentityId, 'jystaff_synthetic');
  assert.equal(calls.audits[0].payload.roller.booking, 'not_found');
});

test('"No payment" releases the attempt only through the guarded statement, with its audit', async () => {
  const { calls, run } = bookingFixture();
  const result = plain(await run('no_payment'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'released');
  assert.equal(calls.gets.length, 1, 'the decision re-checks ROLLER itself');
  assert.equal(calls.releases.length, 1);
  assert.equal(calls.releases[0].verifiedInstallation, installationId);
  assert.equal(calls.releases[0].audit.result, 'released');
  assert.equal(calls.releases[0].audit.staffIdentityId, 'jystaff_synthetic');
  assert.equal(calls.releases[0].audit.roller.booking, 'not_found');
});

for (const [name, fixture, code] of [
  ['ROLLER shows a paid booking', { readback: { ok: true, status: 200, body: confirmedBooking() } }, 'kiosk_payment_roller_payment_found'],
  ['ROLLER shows an unpaid booking', { readback: { ok: true, status: 200, body: confirmedBooking({ costs: { amountOwing: 200 } }) } }, 'kiosk_payment_roller_payment_found'],
  ['ROLLER cannot be read', { readback: new Error('socket hang up') }, 'kiosk_payment_roller_unavailable'],
  ['ROLLER answers 500', { readback: { ok: false, status: 500, body: null } }, 'kiosk_payment_roller_unavailable'],
  ['the attempt is too recent', { row: attemptRow({ age_seconds: 60 }) }, 'kiosk_payment_check_too_early'],
  ['the local cache knows a booking', { row: attemptRow({ local_booking_count: 1 }) }, 'kiosk_payment_not_resolvable'],
  ['the terminal approved the payment', { row: attemptRow({ payment_attempt_status: 'approved' }) }, 'kiosk_payment_not_resolvable'],
  ['the attempt is already resolved', { row: attemptRow({ payment_attempt_status: 'failed' }) }, 'kiosk_payment_not_resolvable'],
]) {
  test(`"No payment" is refused when ${name}`, async () => {
    const { calls, run } = bookingFixture(fixture);
    const result = plain(await run('no_payment'));
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.error.code, code);
    assert.equal(result.body.actions.noPayment, false);
    assert.equal(calls.releases.length, 0);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.audits.at(-1).payload.refusal, code);
  });
}

test('A release that loses a race to an approval or booking is reported, never forced', async () => {
  const { calls, run } = bookingFixture({ release: false });
  const result = plain(await run('no_payment'));
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, 'kiosk_payment_not_resolvable');
  assert.equal(calls.releases.length, 1);
});

test('"Paid" attaches the booking ROLLER confirms, without a publish or payment write', async () => {
  const { calls, run } = bookingFixture({ readback: { ok: true, status: 200, body: confirmedBooking() } });
  const result = plain(await run('paid'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'confirmed');
  assert.equal(result.body.result, 'staff_confirmed_paid');
  assert.equal(calls.gets.length, 1);
  assert.equal(calls.updates.length, 1);
  assert.match(calls.updates[0], /payment_attempt_status = 'approved'[\s\S]*payment_attempt_status IN \('created', 'unknown'\)/);
  assert.equal(calls.handoffs, 1);
  assert.equal(calls.snapshots, 1);
  assert.equal(calls.confirmations, 1);
  assert.deepEqual(calls.needsStaff, []);
  assert.equal(calls.audits.at(-1).payload.result, 'confirmed_paid');
});

test('"Paid" for an add-on purchase uses the add-on attachment and creates no handoff', async () => {
  const { calls, run } = bookingFixture({ row: attemptRow({ flow_type: 'add_product' }),
    readback: { ok: true, status: 200, body: confirmedBooking({ items: [{ productId: '101' }] }) } });
  const result = plain(await run('paid'));
  assert.equal(result.statusCode, 200);
  assert.equal(calls.handoffs, 0);
  assert.equal(calls.confirmations, 1);
});

for (const [name, readback, code] of [
  ['ROLLER has no booking', { ok: false, status: 404, body: null }, 'kiosk_payment_not_paid_in_roller'],
  ['money is still owing', { ok: true, status: 200, body: confirmedBooking({ costs: { amountOwing: 200 } }) }, 'kiosk_payment_not_paid_in_roller'],
  ['ROLLER cannot be read', new Error('timeout'), 'kiosk_payment_roller_unavailable'],
]) {
  test(`"Paid" is refused when ${name}, and nothing is marked paid`, async () => {
    const { calls, run } = bookingFixture({ readback });
    const result = plain(await run('paid'));
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.error.code, code);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.confirmations, 0);
  });
}

test('A paid booking that cannot be attached leaves the attempt with staff, not confirmed', async () => {
  const { calls, run } = bookingFixture({ readback: { ok: true, status: 200, body: confirmedBooking() },
    confirm: { attached_session_count: 0, attached_token_count: 1 } });
  const result = plain(await run('paid'));
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, 'kiosk_payment_needs_manual_check');
  assert.deepEqual(calls.needsStaff, ['authoritative_handoff_attachment_missing']);
});

test('Another installation, an unknown profile or a missing staff id is rejected before ROLLER', async () => {
  for (const [extra, status, code] of [
    [{ kioskCapability: 'D'.repeat(43) }, 409, 'kiosk_installation_not_authorized'],
    [{ kioskProfileId: 'nacka-forum-kiosk-1' }, 409, 'kiosk_installation_not_authorized'],
    [{ staffIdentityId: '' }, 400, 'kiosk_staff_resolution_invalid'],
    [{ action: 'refund' }, 400, 'kiosk_staff_resolution_invalid'],
  ]) {
    const { calls, run } = bookingFixture();
    const result = plain(await run('inspect', extra));
    assert.equal(result.statusCode, status, JSON.stringify(extra));
    assert.equal(result.body.error.code, code);
    assert.equal(calls.gets.length, 0);
  }
  const { calls, run } = bookingFixture({ row: null });
  const result = plain(await run('inspect'));
  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, 'kiosk_payment_attempt_not_found');
  assert.equal(calls.gets.length, 0);
});

test('A paired kiosk is proven through its pairing without a native profile, and the audit names the kiosk', async () => {
  const { calls, run } = bookingFixture({ pairing: nackaK2Pairing });
  const result = plain(await run('no_payment', { kioskProfileId: null }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'released');
  assert.equal(calls.releases.length, 1);
  assert.equal(calls.releases[0].verifiedInstallation, installationId);
  assert.equal(calls.releases[0].audit.kioskNameId, 'nacka-k2');

  for (const [pairing, extra] of [
    [{ ...nackaK2Pairing, status: 'revoked' }, {}],
    [{ ...nackaK2Pairing, kioskNameId: 'nacka-k9' }, {}],
    [nackaK2Pairing, { kioskCapability: 'D'.repeat(43) }],
  ]) {
    const refused = bookingFixture({ pairing });
    const answer = plain(await refused.run('inspect', { kioskProfileId: null, ...extra }));
    assert.equal(answer.statusCode, 409, JSON.stringify({ pairing, extra }));
    assert.equal(answer.body.error.code, 'kiosk_installation_not_authorized');
    assert.equal(refused.calls.gets.length, 0);
  }
  const unpaired = bookingFixture();
  const answer = plain(await unpaired.run('inspect', { kioskProfileId: null }));
  assert.equal(answer.statusCode, 409);
  assert.equal(unpaired.calls.gets.length, 0, 'an unpaired kiosk without a profile never reaches ROLLER');
});

test('An HTTP request can never reach the internal resolution', async () => {
  const { calls } = bookingFixture();
  const backend = loadBooking({ handleKioskStaffResolution: async () => { throw new Error('must not run'); } });
  const response = await backend.handler({
    source: 'jumpyard.kiosk-staff-resolution', detail: { action: 'no_payment' },
    rawPath: '/v1/bookings/unknown', routeKey: 'POST /v1/bookings/unknown', requestContext: { http: { method: 'POST' } },
    body: '{}', headers: {},
  });
  // The route is unknown (or closed by the emergency stop); the internal handler would have thrown.
  assert.ok([404, 409].includes(response.statusCode), String(response.statusCode));
  assert.notEqual(JSON.parse(response.body).error.code, 'booking_failed');
  assert.equal(calls.releases.length, 0);
});

// --- Session Lambda: the PIN proof --------------------------------------------------------------

function pinVerifier(pin = staffPin) {
  const salt = Buffer.from('0123456789abcdef', 'utf8');
  const material = crypto.createHmac('sha256', pepper)
    .update(['staff-pin-verify-v1', 'park-test', '50871', pin].join('\u0000')).digest();
  const derived = crypto.scryptSync(material, salt, 32, { N: 32768, p: 1, r: 8, maxmem: 64 * 1024 * 1024 });
  return `scrypt-v1$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function rowsResult(rows) {
  if (rows.length === 0) return { columnMetadata: [], records: [] };
  const columns = Object.keys(rows[0]);
  const field = (value) => value === null ? { isNull: true } : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? { longValue: value } : { stringValue: String(value) };
  return { columnMetadata: columns.map((name) => ({ label: name, name })), records: rows.map((row) => columns.map((name) => field(row[name]))) };
}

function loadSession({ identity = {}, limited = false, bookingResult, env = {} } = {}) {
  const state = { sql: [], invokes: [], params: [] };
  const fakeAws = new Proxy({}, { get: (_target, property) => class {
    constructor(input) { this.input = input; this.kind = String(property); }
    async send(command) {
      if (property === 'LambdaClient') {
        state.invokes.push(JSON.parse(Buffer.from(command.input.Payload).toString('utf8')));
        if (bookingResult === 'error') return { FunctionError: 'Unhandled', Payload: Buffer.from('{}') };
        return { StatusCode: 200, Payload: Buffer.from(JSON.stringify(bookingResult ?? { statusCode: 200, body: { status: 'inspected' } })) };
      }
      if (property !== 'RDSDataClient') throw new Error(`Unexpected AWS client ${String(property)}`);
      const statement = String(command.input?.sql ?? '');
      state.sql.push(statement);
      state.params.push(JSON.stringify(command.input?.parameters ?? []));
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(statement)) {
        return limited ? rowsResult([{ scope_type: 'venue', blocked_until: new Date(Date.now() + 600000).toISOString() }]) : rowsResult([]);
      }
      if (/INSERT INTO jumpyard\.staff_pin_auth_limits/.test(statement)) return rowsResult([{ source_blocked_until: null, venue_blocked_until: null }]);
      if (/pin_lookup_hash = :pinLookupHash/.test(statement)) {
        return rowsResult([{ active: true, display_name: 'Synthetic Operator', environment: 'park-test', family_name: 'Operator',
          given_name: 'Synthetic', identity_revoked_at: null, pin_verifier: pinVerifier(), pin_pepper_version: 1,
          pin_reenrollment_required_at: null, provider_subject: 'jystaff_synthetic', role: 'staff_operator',
          staff_identity_id: 'jystaff_synthetic', tokens_valid_after: null, venue_id: '50871', ...identity }]);
      }
      throw new Error(`Unexpected SQL in the kiosk PIN proof: ${statement.slice(0, 120)}`);
    }
  } });
  const module = { exports: {} };
  const sandbox = { AbortController, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} }, exports: module.exports, module,
    fetch: () => { throw new Error('No network allowed'); },
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:gh483', DATABASE_SECRET_ARN: 'arn:gh483',
      ENABLE_STAFF_AUTH: 'true', ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true', JUMPYARD_EMERGENCY_STOP: 'false',
      JUMPYARD_ENVIRONMENT: 'park-test',
      KIOSK_STAFF_RESOLUTION_FUNCTION_NAME: 'jumpyard-check-in-park-test-stack-booking',
      STAFF_IDENTITY_ENVIRONMENT: 'park-test', STAFF_IDENTITY_MODE: 'pin', STAFF_IDENTITY_VENUE_ID: '50871',
      STAFF_PIN_PEPPER: pepper, ...env } },
    require(name) {
      if (name.startsWith('@aws-sdk/')) return fakeAws;
      if (name === 'crypto' || name === 'node:crypto') return crypto;
      if (name === './staff-board') return require('../infra/lambda/session/staff-board');
      if (name === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (name.startsWith('./')) return require(path.join(root, 'infra/lambda/session', name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(sessionSource, sandbox);
  const call = (body) => module.exports.handler({
    body: JSON.stringify(body), headers: {}, rawPath: '/v1/staff/kiosk-payments/resolve',
    requestContext: { http: { method: 'POST', path: '/v1/staff/kiosk-payments/resolve', sourceIp: '192.0.2.44' } },
    routeKey: 'POST /v1/staff/kiosk-payments/resolve',
  });
  return { call, state };
}

const kioskBody = (extra = {}) => ({ action: 'inspect', staffPin, prepaymentDraftId, paymentAttemptId,
  rollerDraftUniqueId: draftUniqueId, kioskInstallationId: installationId, kioskProfileId: 'nacka-forum-kiosk-2',
  kioskCapability: capability, ...extra });

test('A valid operator PIN reaches the Booking Lambda as a staff id only, and creates no session', async () => {
  const { call, state } = loadSession({ bookingResult: { statusCode: 200, body: { correlationId: 'booking-side', status: 'inspected' } } });
  const response = await call(kioskBody());
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'inspected');
  assert.notEqual(body.correlationId, 'booking-side');
  assert.equal(state.invokes.length, 1);
  assert.equal(state.invokes[0].source, 'jumpyard.kiosk-staff-resolution');
  assert.equal(state.invokes[0].detail.staffIdentityId, 'jystaff_synthetic');
  assert.equal(state.invokes[0].detail.staffPin, undefined);
  assert.ok(!state.sql.some((statement) => /staff_auth_sessions/.test(statement)), 'no staff session is created or replaced');
  const everything = JSON.stringify(state.invokes) + state.params.join('');
  assert.ok(!everything.includes(staffPin), 'the PIN never leaves the verification');
});

test('A paired kiosk (GH-488) sends no native profile and still reaches the Booking Lambda', async () => {
  const { call, state } = loadSession({ bookingResult: { statusCode: 200, body: { status: 'inspected' } } });
  const response = await call(kioskBody({ kioskProfileId: undefined }));
  assert.equal(response.statusCode, 200);
  assert.equal(state.invokes.length, 1);
  assert.equal(state.invokes[0].detail.kioskProfileId, null);
});

test('A wrong PIN counts against the login limiter and never reaches the Booking Lambda', async () => {
  const { call, state } = loadSession({ identity: { pin_verifier: pinVerifier('739164') } });
  const response = await call(kioskBody());
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error.code, 'staff_pin_invalid');
  assert.ok(state.sql.some((statement) => /INSERT INTO jumpyard\.staff_pin_auth_limits/.test(statement)));
  assert.equal(state.invokes.length, 0);
});

test('A blocked source or venue is refused before the PIN is looked up', async () => {
  const { call, state } = loadSession({ limited: true });
  const response = await call(kioskBody());
  assert.equal(response.statusCode, 429);
  assert.equal(JSON.parse(response.body).error.code, 'staff_pin_rate_limited');
  assert.ok(!state.sql.some((statement) => /pin_lookup_hash/.test(statement)));
  assert.equal(state.invokes.length, 0);
});

test('A read-only staff role cannot resolve kiosk payments', async () => {
  const { call, state } = loadSession({ identity: { role: 'staff_reader' } });
  const response = await call(kioskBody());
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error.code, 'staff_permission_denied');
  assert.equal(state.invokes.length, 0);
});

test('Malformed requests and PINs stop before any database call', async () => {
  for (const [extra, code] of [
    [{ staffPin: '12345' }, 'staff_pin_format_invalid'],
    [{ staffPin: 482951 }, 'staff_pin_format_invalid'],
    [{ action: 'refund' }, 'kiosk_staff_resolution_invalid'],
    [{ kioskCapability: 'short' }, 'kiosk_staff_resolution_invalid'],
    [{ paymentAttemptId: 'jytp_bad' }, 'kiosk_staff_resolution_invalid'],
    [{ kioskProfileId: 'Nacka Kiosk!' }, 'kiosk_staff_resolution_invalid'],
  ]) {
    const { call, state } = loadSession();
    const response = await call(kioskBody(extra));
    assert.equal(response.statusCode, 400, JSON.stringify(extra));
    assert.equal(JSON.parse(response.body).error.code, code);
    assert.equal(state.sql.length, 0);
  }
});

test('A Booking Lambda failure is a retryable 502, and the emergency stop closes the route', async () => {
  let loaded = loadSession({ bookingResult: 'error' });
  let response = await loaded.call(kioskBody());
  assert.equal(response.statusCode, 502);
  assert.equal(JSON.parse(response.body).error.code, 'kiosk_staff_resolution_failed');

  loaded = loadSession({ env: { JUMPYARD_EMERGENCY_STOP: 'true' } });
  response = await loaded.call(kioskBody());
  assert.equal(JSON.parse(response.body).error.code, 'emergency_stop_active');
  assert.equal(loaded.state.sql.length, 0);
});

test('Without personal staff PINs the route does not exist', async () => {
  const { call, state } = loadSession({ env: { STAFF_IDENTITY_MODE: 'legacy' } });
  const response = await call(kioskBody());
  assert.equal(response.statusCode, 404);
  assert.equal(state.sql.length, 0);
});

// --- PostgreSQL ---------------------------------------------------------------------------------

test('PostgreSQL: the guarded release frees the kiosk claims, writes its audit and refuses every unsafe case', {
  skip: process.env.GH483_DATABASE_TEST !== 'true',
}, async () => {
  const { Pool } = require('../infra/node_modules/pg');
  const port = Number(process.env.GH483_PGPORT || 55483);
  assert.ok([55483, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const connection = { host: '127.0.0.1', port, database: 'jumpyard_cloud',
    user: port === 55483 ? 'gh483_test' : 'gh345_test', password: '', ssl: false };
  const admin = new Pool(connection);
  const runtime = new Pool({ ...connection, max: 4, options: '-c role=jumpyard_booking_runtime' });
  const prefix = `gh483_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const executeStatement = async (sql, parameters = []) => {
    const indexes = new Map(parameters.map((p, i) => [p.name, i + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (m, name) => indexes.has(name) ? `$${indexes.get(name)}` : m);
    const result = await runtime.query(prepared, parameters.map((p) => p.value.stringValue ?? p.value.longValue ?? null));
    return { columnMetadata: result.fields.map((f) => ({ name: f.name })),
      records: result.rows.map((r) => result.fields.map((f) => (r[f.name] === null ? { isNull: true } : { stringValue: String(r[f.name]) }))) };
  };
  const backend = loadBooking({ executeStatement, completeIdempotencyKey: async () => {} });
  const ids = (suffix) => ({
    prepaymentDraftId: `jypd_${crypto.createHash('sha256').update(prefix + suffix).digest('hex').slice(0, 18)}`,
    paymentAttemptId: `jytp_${crypto.createHash('sha256').update(prefix + suffix + 'attempt').digest('hex').slice(0, 18)}`,
    rollerDraftUniqueId: `${prefix}-${suffix}`,
  });
  const created = [];
  const insertDraft = async (suffix, { status = 'unknown', ageMinutes = 10, installation = installationId } = {}) => {
    const attempt = ids(suffix);
    created.push(attempt.prepaymentDraftId);
    await admin.query(`INSERT INTO jumpyard.prepayment_booking_drafts
      (prepayment_draft_id, roller_draft_unique_id, external_id, idempotency_key, roller_env, flow_type, payment_channel,
       payment_attempt_id, payment_attempt_status, booking_confirmation_status, kiosk_installation_id, amount_owing_cents,
       total_cents, created_at)
      VALUES ($1, $2, $3, $1, 'playground', 'new_booking', 'card_present', $4, $5, 'needs_staff', $6, 20000, 20000,
              now() - make_interval(mins => $7))`,
    [attempt.prepaymentDraftId, attempt.rollerDraftUniqueId, `JY-D-${prefix}-${suffix}`, attempt.paymentAttemptId,
      status, installation, ageMinutes]);
    return attempt;
  };
  const release = (attempt, installation = installationId) => backend.releaseKioskAttemptWithoutPayment(
    attempt, installation, `${prefix}-correlation`, { action: 'no_payment', result: 'released', staffIdentityId: 'jystaff_synthetic' });
  const stored = async (attempt) => (await admin.query(
    'SELECT payment_attempt_status, status, booking_confirmation_status FROM jumpyard.prepayment_booking_drafts WHERE payment_attempt_id = $1',
    [attempt.paymentAttemptId])).rows[0];
  const keys = [`jykb_install_${prefix}`, `jykb_terminal_${prefix}`].sort();
  try {
    // An uncertain attempt holds both kiosk claims, exactly as D0220 leaves it.
    const stuck = await insertDraft('stuck');
    await admin.query(`INSERT INTO jumpyard.idempotency_records (idempotency_key, operation, request_hash, status, result_ref, expires_at)
      SELECT key, 'kiosk_terminal_binding', $1, 'started', $1, 'infinity' FROM unnest($2::text[]) AS key`, [stuck.paymentAttemptId, keys]);
    const busy = await backend.reserveKioskDraftBinding({ reservationKeys: keys }, { idempotencyKey: `${prefix}-busy` });
    assert.equal(busy.code, 'kiosk_payment_busy');

    const view = await backend.findKioskStaffResolutionAttempt(stuck, installationId);
    assert.ok(Number(view.age_seconds) >= 590);
    assert.equal(Number(view.local_booking_count), 0);
    assert.equal(await backend.findKioskStaffResolutionAttempt(stuck, `ki_${'0'.repeat(24)}`), null, 'another kiosk sees nothing');

    assert.equal(await release(stuck), true);
    assert.deepEqual(await stored(stuck), { payment_attempt_status: 'failed', status: 'failed', booking_confirmation_status: 'failed' });
    const audit = await admin.query(`SELECT event_payload FROM jumpyard.event_log
      WHERE event_type = 'booking.kiosk_staff_resolution' AND subject_ref = $1`, [stuck.prepaymentDraftId]);
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].event_payload.staffIdentityId, 'jystaff_synthetic');
    assert.equal(await release(stuck), false, 'a second release is a no-op');

    // The kiosk can sell again at once: the next draft takes over both claims.
    const next = { idempotencyKey: `${prefix}-next` };
    assert.equal(await backend.reserveKioskDraftBinding({ reservationKeys: keys }, next), null);
    assert.match(next.reservedPaymentAttemptId, /^jytp_/);

    const recent = await insertDraft('recent', { ageMinutes: 1 });
    assert.equal(await release(recent), false, 'the minimum age is enforced in the statement');
    const approved = await insertDraft('approved', { status: 'approved' });
    assert.equal(await release(approved), false);
    const foreign = await insertDraft('foreign');
    assert.equal(await release(foreign, `ki_${'0'.repeat(24)}`), false);
    const booked = await insertDraft('booked');
    await admin.query(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, normalized_summary)
      VALUES ($1, $1, 'playground', jsonb_build_object('externalId', $2::text))`, [`${prefix}-roller-booking`, `JY-D-${prefix}-booked`]);
    assert.equal(await release(booked), false, 'a booking in the local cache blocks the release');
    for (const attempt of [recent, approved, foreign, booked]) {
      assert.notEqual((await stored(attempt)).payment_attempt_status, 'failed');
    }
  } finally {
    await admin.query('DELETE FROM jumpyard.event_log WHERE subject_ref = ANY($1)', [created]);
    await admin.query('DELETE FROM jumpyard.roller_bookings WHERE roller_unique_id LIKE $1', [`${prefix}%`]);
    await admin.query('DELETE FROM jumpyard.idempotency_records WHERE idempotency_key = ANY($1) OR idempotency_key LIKE $2', [keys, `${prefix}%`]);
    await admin.query('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = ANY($1)', [created]);
    await runtime.end(); await admin.end();
  }
});
