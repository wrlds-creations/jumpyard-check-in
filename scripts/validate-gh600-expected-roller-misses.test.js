// GH-600 (D0290): ROLLER answers 404 when a booking does not exist. Two callers answer that 404 as a
// normal result, so it counts as RollerApiExpectedMissCount instead of RollerApiErrorCount, as the kiosk
// reconciliation's waits do since GH-531 (D0258):
// - the Lookup Lambda's direct identifier lookup, which answers 404 booking_not_found to the guest;
// - the Booking Lambda's kiosk staff resolution, where the 404 is the "no booking" evidence (D0239).
// Every other status, every other 404 and every other caller still count as ROLLER errors.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const lookupFile = path.join(root, 'infra/lambda/lookup/index.js');
const lookupSource = fs.readFileSync(lookupFile, 'utf8');
const bookingSource = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const stack = fs.readFileSync(path.join(root, 'infra/lib/jumpyard-cloud-stack.ts'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');

const ENVIRONMENT = 'jumpyard-check-in-park-test';
const LOOKUP_DATE = '2026-10-27';
const VENUE_ID = '50871';
const CONTEXT = { awsRequestId: 'a1b2c3d4-1234-1234-1234-a1b2c3d4e5f6' };
// Synthetic identifiers that ROLLER does not know.
const UNKNOWN_REFERENCE = '100000600';
const UNKNOWN_QR = '00000000-0000-4000-8000-000000000600';
const DIMENSIONS = [['Environment'], ['Environment', 'Handler'], ['Environment', 'Handler', 'Operation', 'Method']];
const FAILURES = [400, 401, 403, 409, 429, 500, 502, 503];
const plain = (value) => JSON.parse(JSON.stringify(value));
const answer = (status, body = null) => ({ status, body });

function rollerResponse(next) {
  return {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    text: async () => (next.body === null ? '' : JSON.stringify(next.body)),
  };
}

// Read when called, so a harness sees every metric line its run has written.
function metricsIn(logs) {
  const metrics = () => logs.filter((entry) => entry && entry._aws && 'RollerApiCallCount' in entry);
  return { metrics, count: (name) => metrics().filter((entry) => entry[name] === 1).length };
}

function assertMetricShape(record, { handler, status, names }) {
  assert.deepEqual(record._aws.CloudWatchMetrics[0].Metrics.map((metric) => metric.Name), names);
  assert.deepEqual(plain(record._aws.CloudWatchMetrics[0].Dimensions), DIMENSIONS);
  assert.equal(record.Environment, ENVIRONMENT);
  assert.equal(record.Handler, handler);
  assert.equal(record.Operation, 'get_booking_detail');
  assert.equal(record.Method, 'GET');
  assert.equal(record.StatusCode, status);
  assert.equal(record.Ok, false);
}

// --- Lookup Lambda ------------------------------------------------------------------------------

// The real Lookup handler as Park runs it (assisted lookup at Nacka on an approved date), with the
// real getBookingDetail and emitRollerApiMetric. Aurora knows no booking, so the lookup asks ROLLER.
// `details` scripts ROLLER's booking detail answers in order and ends in 404; `search` is the answer
// to ROLLER's booking search.
function loadLookup({ details = [], search = answer(200, { items: [] }), env = {} } = {}) {
  const logs = [];
  const calls = [];
  const module = { exports: {} };
  const aws = new Proxy({}, { get: (_target, key) => class {
    constructor(input) { this.input = input; }
    async send() {
      if (String(key) !== 'RDSDataClient') throw new Error(`Unexpected AWS service in GH600 tests: ${String(key)}`);
      return { records: [], columnMetadata: [] };
    }
  } });
  const record = (line) => {
    try { logs.push(JSON.parse(line)); } catch { logs.push(String(line)); }
  };
  const sandbox = vm.createContext({
    module, exports: module.exports, Buffer, TextEncoder, TextDecoder, URL, URLSearchParams,
    AbortController, AbortSignal,
    // The ROLLER request pacing waits a second between calls; the scripted ROLLER needs no pause.
    setTimeout: (callback) => { callback(); return 0; },
    clearTimeout: () => {},
    console: { log: record, info: record, warn: record, error: record },
    process: { env: {
      JUMPYARD_ENVIRONMENT: 'park-test',
      JUMPYARD_EMERGENCY_STOP: 'false',
      ENABLE_T0171_ASSISTED_LOOKUP: 'true',
      T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: LOOKUP_DATE,
      T0171_ASSISTED_LOOKUP_VENUE_ID: VENUE_ID,
      RESOURCE_PREFIX: ENVIRONMENT,
      JUMPYARD_HANDLER: 'lookup',
      DATABASE_CLUSTER_ARN: 'synthetic-cluster',
      DATABASE_SECRET_ARN: 'synthetic-secret',
      ...env,
    } },
    fetch: async (url, init) => {
      const target = new URL(String(url));
      assert.equal(target.origin, 'https://roller.invalid', 'only the scripted ROLLER host is called');
      assert.equal(init.method, 'GET');
      const route = target.pathname.replace(/^\/api/, '');
      calls.push(route);
      if (route === '/venues/me') return rollerResponse(answer(200, { id: Number(VENUE_ID) }));
      if (route === '/bookings') return rollerResponse(search);
      const next = details.shift() ?? answer(404);
      if (next instanceof Error) throw next;
      return rollerResponse(next);
    },
    require(id) {
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id === 'crypto') return crypto;
      if (id.startsWith('./')) return require(path.join(path.dirname(lookupFile), id));
      throw new Error(`Unexpected import in GH600 tests: ${id}`);
    },
  });
  vm.runInContext(lookupSource, sandbox, { filename: lookupFile });
  vm.runInContext(`
    cachedRollerConfig = { env: 'live', baseUrl: 'https://roller.invalid/api', clientId: 'synthetic', clientSecret: 'synthetic' };
    cachedRollerConfigExpiresAt = Date.now() + 60000;
    cachedToken = { accessToken: 'synthetic', tokenType: 'Bearer', expiresAt: Date.now() + 60000 };
    getProductCatalogBestEffort = async () => ({ status: 'available', byId: new Map() });
  `, sandbox);
  const lookup = async (identifier) => {
    const result = await module.exports.handler({
      body: JSON.stringify({ identifier, expectedDate: LOOKUP_DATE, correlationId: 'gh600-lookup' }),
      routeKey: 'POST /v1/check-in/lookup',
      rawPath: '/v1/check-in/lookup',
      requestContext: { requestId: 'gh600Request01=', http: { method: 'POST' } },
    }, CONTEXT);
    return { statusCode: result.statusCode, body: JSON.parse(result.body) };
  };
  const refresh = async (identifier) => {
    const result = await module.exports.handler({
      source: 'jumpyard.t0201-controlled-t30-email',
      detail: {
        trigger: 'authoritative_booking_refresh',
        approval: 'T0201_SINGLE_BOOKING_T30_EMAIL_APPROVED',
        identifier,
        expectedIdentifierSha256: crypto.createHash('sha256').update(identifier).digest('hex'),
        expectedVenueId: VENUE_ID,
        expectedBookingDate: LOOKUP_DATE,
        expectedStartTime: '11:00',
      },
    }, CONTEXT);
    return { statusCode: result.statusCode, body: JSON.parse(result.body) };
  };
  const serverErrors = () => logs.filter((entry) => entry?.eventType === 'cloud.server_error');
  return { calls, logs, lookup, refresh, serverErrors, run: (code) => vm.runInContext(code, sandbox), ...metricsIn(logs) };
}

for (const [name, identifier] of [['booking number', UNKNOWN_REFERENCE], ['QR code', UNKNOWN_QR]]) {
  test(`A lookup of an unknown ${name} answers booking_not_found and counts an expected miss`, async () => {
    const app = loadLookup();
    const result = await app.lookup(identifier);
    assert.equal(result.statusCode, 404);
    assert.equal(result.body.status, 'not_found');
    assert.deepEqual(result.body.error, {
      code: 'booking_not_found',
      message: 'No Roller booking was found for the supplied identifier.',
    }, 'the guest sees the same "not found"');
    assert.deepEqual(app.calls, [`/bookings/${identifier}`], 'one ROLLER read, as before');
    assert.equal(app.count('RollerApiCallCount'), 1, 'the call is still counted');
    assert.equal(app.count('RollerApiExpectedMissCount'), 1);
    assert.equal(app.count('RollerApiErrorCount'), 0);
    assertMetricShape(app.metrics()[0], { handler: 'lookup', status: 404,
      names: ['RollerApiCallCount', 'RollerApiExpectedMissCount'] });
    assert.equal(app.serverErrors().length, 0);
  });
}

for (const status of FAILURES) {
  test(`A ROLLER ${status} on the same lookup still counts a ROLLER error`, async () => {
    const app = loadLookup({ details: [answer(status, { error: 'synthetic' })] });
    const result = await app.lookup(UNKNOWN_REFERENCE);
    assert.equal(result.statusCode, 502);
    assert.equal(result.body.error.code, 'roller_lookup_failed');
    assert.equal(app.count('RollerApiCallCount'), 1);
    assert.equal(app.count('RollerApiErrorCount'), 1);
    assert.equal(app.count('RollerApiExpectedMissCount'), 0);
    assertMetricShape(app.metrics()[0], { handler: 'lookup', status, names: ['RollerApiCallCount', 'RollerApiErrorCount'] });
    assert.equal(app.serverErrors().length, 1, 'the 502 keeps its server-error report');
    assert.equal(app.serverErrors()[0].providerStatusCode, status);
  });
}

test('A ROLLER timeout on the same lookup is unchanged and never an expected miss', async () => {
  const app = loadLookup({ details: [Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' })] });
  const result = await app.lookup(UNKNOWN_REFERENCE);
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.error.code, 'lookup_failed');
  assert.equal(app.count('RollerApiExpectedMissCount'), 0);
  assert.equal(app.serverErrors().length, 1);
  assert.equal(app.serverErrors()[0].stage, 'roller_booking_detail');
  assert.equal(app.serverErrors()[0].failureCategory, 'timeout');
});

test('A 404 on the detail read of a booking ROLLER\'s search just returned still counts as an error', async () => {
  const app = loadLookup({ search: answer(200, { items: [{ uniqueId: 'synthetic-search-hit' }] }) });
  const result = await app.lookup('guest@example.invalid');
  assert.equal(result.statusCode, 404, 'the lookup answers as before');
  assert.equal(result.body.error.code, 'booking_not_found');
  assert.deepEqual(app.calls, ['/venues/me', '/bookings', '/bookings/synthetic-search-hit']);
  assert.equal(app.count('RollerApiCallCount'), 3);
  assert.equal(app.count('RollerApiExpectedMissCount'), 0);
  assert.equal(app.count('RollerApiErrorCount'), 1);
  assertMetricShape(app.metrics().find((entry) => entry.RollerApiErrorCount === 1), { handler: 'lookup', status: 404,
    names: ['RollerApiCallCount', 'RollerApiErrorCount'] });
});

test('The T0201 controlled refresh keeps counting its 404 as an error', async () => {
  const app = loadLookup({ env: { ENABLE_T0201_CONTROLLED_T30_EMAIL_REFRESH: 'true' } });
  const result = await app.refresh(UNKNOWN_REFERENCE);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.verification, { ok: false, reason: 'roller_booking_not_found', refreshedFromRoller: true });
  assert.deepEqual(app.calls, [`/bookings/${UNKNOWN_REFERENCE}`]);
  assert.equal(app.count('RollerApiErrorCount'), 1);
  assert.equal(app.count('RollerApiExpectedMissCount'), 0);
});

test('getBookingDetail names a miss only for the status its caller expects', async () => {
  const app = loadLookup({ details: [answer(404), answer(500), answer(200, { uniqueId: 'synthetic' })] });
  const config = { baseUrl: 'https://roller.invalid/api' };
  const token = { accessToken: 'synthetic', tokenType: 'Bearer' };
  const read = app.run('getBookingDetail');
  assert.equal((await read(config, token, UNKNOWN_REFERENCE)).status, 404);
  assert.equal((await read(config, token, UNKNOWN_REFERENCE, { expectedMissStatus: 404 })).status, 500);
  assert.equal((await read(config, token, UNKNOWN_REFERENCE, { expectedMissStatus: 404 })).status, 200);
  assert.deepEqual(app.metrics().map((entry) => [entry.StatusCode, entry.RollerApiErrorCount ?? 0,
    entry.RollerApiExpectedMissCount ?? 0]), [[404, 1, 0], [500, 1, 0], [200, 0, 0]]);
});

// --- Booking Lambda: the kiosk staff resolution ------------------------------------------------

const capability = 'C'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
const draftUniqueId = 'synthetic-draft-uuid';
const prepaymentDraftId = `jypd_${'1'.repeat(18)}`;
const paymentAttemptId = `jytp_${'2'.repeat(18)}`;

const kioskConfig = () => ({
  env: 'live', baseUrl: 'https://roller.invalid/api', kioskVenueId: VENUE_ID, allowLegacyKioskTerminalAlias: false,
  kioskInstallations: contract.normalizeKioskInstallationMap({
    [installationId]: { active: true, allowedProfileIds: ['nacka-forum-kiosk-2'], venueId: VENUE_ID },
  }),
  kioskProfiles: contract.normalizeKioskProfileMap({
    'nacka-forum-kiosk-2': { active: true, paymentTerminalAlias: 'primary', venueId: VENUE_ID },
  }),
  paymentTerminals: contract.normalizePaymentTerminalMap({
    primary: { terminalId: 'synthetic-terminal', deviceId: 'synthetic-device', lockId: `kt_${'4'.repeat(32)}` },
  }),
  kioskNames: contract.normalizeKioskNameMap({}),
});

// An unpaid kiosk attempt that the terminal never reported, old enough for "no payment" (D0239).
const unpaidAttempt = () => ({
  prepayment_draft_id: prepaymentDraftId,
  roller_draft_unique_id: draftUniqueId,
  payment_attempt_id: paymentAttemptId,
  payment_attempt_status: 'unknown',
  status: 'payment_pending',
  flow_type: 'new_booking',
  booking_confirmation_status: 'needs_staff',
  roller_booking_reference: null,
  roller_env: 'live',
  total_cents: 20000,
  amount_owing_cents: 20000,
  currency: 'SEK',
  age_seconds: 420,
  local_booking_count: 0,
});

// The real staff resolution with the real readKioskStaffRollerEvidence, getRollerJson and
// emitRollerApiMetric. Only ROLLER's answer and the database steps are scripted.
function loadStaffResolution(readback) {
  const module = { exports: {} };
  const logs = [];
  const calls = { gets: [], releases: 0, audits: [], statements: [] };
  const fakeAws = new Proxy({}, { get: () => class {
    constructor(input) { this.input = input; }
    async send() { throw new Error('No AWS calls allowed in GH600 booking tests'); }
  } });
  const capture = (line) => {
    try { logs.push(JSON.parse(line)); } catch { /* not a metric line */ }
  };
  const overrides = {
    getRollerConfig: async () => kioskConfig(),
    readKioskPairing: async () => null,
    getRollerAccessToken: async () => ({ accessToken: 'synthetic-access', tokenType: 'Bearer' }),
    findKioskStaffResolutionAttempt: async (_request, verifiedInstallation) => {
      assert.equal(verifiedInstallation, installationId);
      return unpaidAttempt();
    },
    releaseKioskAttemptWithoutPayment: async () => { calls.releases += 1; return true; },
    executeStatement: async (sql) => { calls.statements.push(String(sql)); return { records: [], columnMetadata: [] }; },
    writeBookingEventLog: async (entry) => { calls.audits.push(plain(entry)); },
    emitKioskTerminalOutcomeMetric: () => {},
  };
  const sandbox = { Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, crypto, module,
    console: { error() {}, info() {}, log: capture, warn() {} },
    exports: module.exports, process: { env: { RESOURCE_PREFIX: ENVIRONMENT } }, setTimeout, clearTimeout, overrides,
    fetch: async (url, init) => {
      const target = new URL(String(url));
      assert.equal(target.origin, 'https://roller.invalid', 'only the scripted ROLLER host is called');
      assert.equal(init.method, 'GET');
      calls.gets.push(target.pathname.replace(/^\/api/, ''));
      if (readback instanceof Error) throw readback;
      return rollerResponse(readback);
    },
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
    '\nmodule.exports.tests = { handleKioskStaffResolution };', sandbox);
  const run = async (action) => plain(await module.exports.tests.handleKioskStaffResolution({
    action, prepaymentDraftId, paymentAttemptId, rollerDraftUniqueId: draftUniqueId,
    kioskInstallationId: installationId, kioskProfileId: 'nacka-forum-kiosk-2', kioskCapability: capability,
    staffIdentityId: 'jystaff_synthetic',
  }, 'gh600-staff'));
  return { calls, run, ...metricsIn(logs) };
}

for (const [action, statusCode, outcome] of [
  ['inspect', 200, (body) => assert.equal(body.status, 'inspected')],
  ['no_payment', 200, (body) => assert.equal(body.status, 'released')],
  ['paid', 409, (body) => assert.equal(body.error.code, 'kiosk_payment_not_paid_in_roller')],
]) {
  test(`The staff "${action}" check on an unpaid attempt counts ROLLER's 404 as an expected miss`, async () => {
    const app = loadStaffResolution(answer(404));
    const result = await app.run(action);
    assert.equal(result.statusCode, statusCode);
    outcome(result.body);
    assert.equal(result.body.roller.booking, 'not_found', 'the 404 is still the "no booking" evidence');
    assert.equal(app.calls.releases, action === 'no_payment' ? 1 : 0, 'the decision is unchanged');
    assert.deepEqual(app.calls.gets, [`/bookings/${draftUniqueId}`], 'one ROLLER read per request, as before');
    assert.equal(app.count('RollerApiCallCount'), 1);
    assert.equal(app.count('RollerApiExpectedMissCount'), 1);
    assert.equal(app.count('RollerApiErrorCount'), 0);
    assertMetricShape(app.metrics()[0], { handler: 'booking', status: 404,
      names: ['RollerApiCallCount', 'RollerApiExpectedMissCount'] });
  });
}

for (const status of FAILURES) {
  test(`A ROLLER ${status} on the staff check still counts a ROLLER error`, async () => {
    const app = loadStaffResolution(answer(status, { error: 'synthetic' }));
    const result = await app.run('no_payment');
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.error.code, 'kiosk_payment_roller_unavailable');
    assert.equal(app.calls.releases, 0);
    assert.equal(app.count('RollerApiErrorCount'), 1);
    assert.equal(app.count('RollerApiExpectedMissCount'), 0);
    assertMetricShape(app.metrics()[0], { handler: 'booking', status, names: ['RollerApiCallCount', 'RollerApiErrorCount'] });
  });
}

test('A staff check that cannot reach ROLLER, or finds a booking, is unchanged', async () => {
  const unreachable = loadStaffResolution(Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' }));
  const refused = await unreachable.run('no_payment');
  assert.equal(refused.body.error.code, 'kiosk_payment_roller_unavailable');
  assert.equal(unreachable.count('RollerApiExpectedMissCount'), 0);

  const booked = loadStaffResolution(answer(200, { uniqueId: draftUniqueId, paymentStatus: 'Pending',
    costs: { amountOwing: 200 }, items: [{ productId: '101', tickets: [{ ticketId: 'synthetic-ticket' }] }] }));
  const found = await booked.run('no_payment');
  assert.equal(found.body.error.code, 'kiosk_payment_roller_payment_found');
  assert.equal(booked.count('RollerApiCallCount'), 1);
  assert.equal(booked.count('RollerApiErrorCount'), 0);
  assert.equal(booked.count('RollerApiExpectedMissCount'), 0);
});

// --- Scope ------------------------------------------------------------------------------------

test('Only the direct lookup and the three Booking callers name an expected miss', () => {
  assert.equal(lookupSource.match(/expectedMissStatus: 404/g).length, 1);
  assert.match(lookupSource, /getBookingDetail\(config, token, request\.identifier, \{ expectedMissStatus: 404 \}\)/);
  assert.match(lookupSource, /const detailResult = await getBookingDetail\(config, token, identifier\);/,
    'the T0201 refresh is unchanged');
  assert.match(lookupSource, /const detailResult = await getBookingDetail\(config, token, detailIdentifier\);/,
    'a search hit is unchanged');
  assert.equal(bookingSource.match(/expectedMissStatus:/g).length, 3);
  assert.match(bookingSource, /expectedMissStatus: lastAttempt \? null : 404,/);
  assert.match(bookingSource, /readKioskStaffRollerEvidence\(config, holder, \{ expectedMissStatus: 404 \}\)/);
  assert.match(bookingSource, /readKioskStaffRollerEvidence\(config, row, \{ expectedMissStatus: 404 \}\)/);
});

test('The ROLLER alarms still read only RollerApiErrorCount, and the misses get no alarm', () => {
  assert.match(stack, /metricName: 'RollerApiErrorCount'/);
  assert.doesNotMatch(stack, /RollerApiExpectedMissCount/);
  assert.match(packageJson, /"validate:gh600-expected-roller-misses": "node --test scripts\/validate-gh600-expected-roller-misses\.test\.js"/);
  assert.match(packageJson, /npm run validate:gh600-expected-roller-misses/);
});
