// GH-531 (D0258): while the kiosk reconciliation waits for ROLLER to create a paid booking, its 404
// readbacks are expected misses, not ROLLER errors. The last attempt's 404 and every real failure
// still count as RollerApiErrorCount, and every other caller is unchanged.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const stack = fs.readFileSync(path.join(root, 'infra/lib/jumpyard-cloud-stack.ts'), 'utf8');
const draftUniqueId = 'synthetic-draft-uuid';
const prepaymentDraftId = `jypd_${'1'.repeat(18)}`;
const paymentAttemptId = `jytp_${'2'.repeat(18)}`;
const attempts = Number(source.match(/KIOSK_RECONCILIATION_OFFSETS_MS = \[([\s\S]*?)\];/)[1].split(',')
  .filter((entry) => entry.trim()).length);
const plain = (value) => JSON.parse(JSON.stringify(value));

const confirmedBooking = {
  uniqueId: draftUniqueId,
  bookingReference: '171849053',
  paymentStatus: 'Paid',
  costs: { amountOwing: 0 },
  items: [{ productId: '101', tickets: [{ ticketId: 'synthetic-ticket' }] }],
};

// Loads the real Booking Lambda with the real getRollerJson and emitRollerApiMetric. Only the
// network answers and the database steps are scripted; `answers` is consumed per ROLLER GET and
// ends in 404, as ROLLER answers while it has no booking.
function loadBackend({ answers = [] } = {}) {
  const module = { exports: {} };
  const metrics = [];
  const gets = [];
  const fakeAws = new Proxy({}, { get: () => class {
    constructor(input) { this.input = input; }
    async send() { throw new Error('No AWS calls allowed in GH531 tests'); }
  } });
  const capture = (line) => {
    try {
      const record = JSON.parse(line);
      if (record && record._aws && 'RollerApiCallCount' in record) metrics.push(record);
    } catch { /* not a metric line */ }
  };
  const overrides = {
    findKioskPrepaymentAttempt: async () => ({ payment_attempt_status: 'approved',
      booking_confirmation_status: 'pending', status: 'payment_pending', flow_type: 'new_booking',
      roller_draft_unique_id: draftUniqueId, payment_attempt_id: paymentAttemptId }),
    isEmergencyStopEnabled: () => false,
    isNewBookingDraftWriteEnabled: () => true,
    isAddProductDraftWriteEnabled: () => true,
    // No terminal transaction: readback only, as on Park while #481 is paused.
    claimKioskReconciliation: async () => ({ roller_draft_unique_id: draftUniqueId,
      payment_approved_at: new Date().toISOString(), amount_owing_cents: 20000 }),
    getRollerConfig: async () => ({ env: 'playground', baseUrl: 'https://roller.invalid/api' }),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic-access', tokenType: 'Bearer' }),
    recordKioskReconciliationAttempt: async () => {},
    persistKioskReconciliationBookingSnapshot: async () => {},
    confirmKioskReconciliation: async () => ({ attached_session_count: 1, attached_token_count: 1,
      reconciliation_attempt_count: 1 }),
    markKioskReconciliationNeedsStaff: async () => {},
    writeBookingEventLog: async () => {},
    wait: async () => {},
  };
  const sandbox = { Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, crypto, module,
    exports: module.exports, process: { env: { RESOURCE_PREFIX: 'jumpyard-check-in-test' } },
    setTimeout, clearTimeout, overrides,
    console: { log: capture, info: () => {}, warn: () => {}, error: () => {} },
    fetch: async (url, init) => {
      const target = new URL(String(url));
      assert.equal(target.origin, 'https://roller.invalid', 'only the scripted ROLLER host is called');
      assert.equal(init.method, 'GET');
      gets.push(target.pathname);
      const next = answers.shift() ?? { status: 404, body: null };
      return { ok: next.status >= 200 && next.status < 300, status: next.status,
        text: async () => (next.body === null ? '' : JSON.stringify(next.body)) };
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
  vm.runInNewContext(source + '\n' + Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n') +
    '\nmodule.exports.tests = { handleKioskPaymentReconciliation, getRollerJson, emitRollerApiMetric };', sandbox);
  const backend = module.exports.tests;
  const reconcile = () => backend.handleKioskPaymentReconciliation({ prepaymentDraftId, paymentAttemptId }, 'test-correlation');
  const count = (name) => metrics.filter((record) => record[name] === 1).length;
  return { backend, reconcile, metrics, gets, count };
}

test('The reconciliation waits through 404s as expected misses, with no ROLLER error', async () => {
  const answers = [...Array.from({ length: 12 }, () => ({ status: 404, body: null })), { status: 200, body: confirmedBooking }];
  const { reconcile, metrics, gets, count } = loadBackend({ answers });
  assert.deepEqual(plain(await reconcile()), { status: 'confirmed' });
  assert.equal(gets.length, 13, 'one readback per attempt, as before');
  assert.equal(count('RollerApiCallCount'), 13, 'every call is still counted');
  assert.equal(count('RollerApiErrorCount'), 0);
  assert.equal(count('RollerApiExpectedMissCount'), 12);
  const miss = metrics.find((record) => record.RollerApiExpectedMissCount === 1);
  assert.deepEqual(miss._aws.CloudWatchMetrics[0].Metrics.map((metric) => metric.Name),
    ['RollerApiCallCount', 'RollerApiExpectedMissCount']);
  assert.deepEqual(plain(miss._aws.CloudWatchMetrics[0].Dimensions),
    [['Environment'], ['Environment', 'Handler'], ['Environment', 'Handler', 'Operation', 'Method']]);
  assert.equal(miss.Operation, 'get_booking_detail');
  assert.equal(miss.Method, 'GET');
  assert.equal(miss.StatusCode, 404);
  assert.equal(miss.Ok, false);
});

test('A reconciliation that runs out of its window still counts a ROLLER error', async () => {
  const { reconcile, gets, count } = loadBackend();
  assert.deepEqual(plain(await reconcile()), { status: 'needs_staff' });
  assert.equal(attempts, 16);
  assert.equal(gets.length, attempts, 'the same 16 readbacks as before');
  assert.equal(count('RollerApiCallCount'), attempts);
  assert.equal(count('RollerApiExpectedMissCount'), attempts - 1);
  assert.equal(count('RollerApiErrorCount'), 1, 'the last attempt\'s 404 is the timeout error');
});

test('Real ROLLER failures during the wait stay errors', async () => {
  const answers = [404, 503, 401, 429, 500, 400].map((status) => ({ status, body: null }));
  answers.push({ status: 200, body: confirmedBooking });
  const { reconcile, metrics, count } = loadBackend({ answers });
  assert.deepEqual(plain(await reconcile()), { status: 'confirmed' });
  assert.equal(count('RollerApiCallCount'), 7);
  assert.equal(count('RollerApiExpectedMissCount'), 1);
  assert.deepEqual(metrics.filter((record) => record.RollerApiErrorCount === 1).map((record) => record.StatusCode),
    [503, 401, 429, 500, 400]);
});

test('Every other caller keeps counting a 404 as a ROLLER error', async () => {
  const { backend, count, metrics } = loadBackend({ answers: [{ status: 404, body: null }, { status: 500, body: null }] });
  const config = { baseUrl: 'https://roller.invalid/api' };
  const token = { accessToken: 'synthetic-access', tokenType: 'Bearer' };
  assert.equal((await backend.getRollerJson(config, token, '/bookings/171849053')).status, 404);
  // Naming 404 as the expected miss never hides another status.
  assert.equal((await backend.getRollerJson(config, token, '/bookings/171849053', { expectedMissStatus: 404 })).status, 500);
  backend.emitRollerApiMetric({ method: 'GET', operation: 'get_booking_detail', status: 404, ok: false });
  assert.equal(count('RollerApiErrorCount'), 3);
  assert.equal(count('RollerApiExpectedMissCount'), 0);
  assert.deepEqual(metrics.map((record) => record.StatusCode), [404, 500, 404]);
  // Only the kiosk reconciliation names an expected miss.
  assert.equal(source.match(/expectedMissStatus:/g).length, 1);
  assert.match(source, /const lastAttempt = index === KIOSK_RECONCILIATION_OFFSETS_MS\.length - 1;/);
  assert.match(source, /expectedMissStatus: lastAttempt \? null : 404,/);
});

test('The ROLLER alarms still read only RollerApiErrorCount', () => {
  assert.match(stack, /metricName: 'RollerApiErrorCount'/);
  assert.doesNotMatch(stack, /RollerApiExpectedMissCount/);
});
