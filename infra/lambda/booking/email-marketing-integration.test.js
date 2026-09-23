'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const marketing = require('./email-marketing-consent');
const id = '00000000-0000-4000-8000-000000000001';
const customer = { firstName: 'Test', lastName: 'Person', email: 'test@example.invalid', phone: '0701234567',
  acceptMarketing: true, acceptMarketingSms: true };
const choice = { granted: true, copyVersion: marketing.COPY_VERSION, locale: 'sv' };
const plain = value => JSON.parse(JSON.stringify(value));
function rows(values) {
  const columns = Object.keys(values[0] ?? {});
  return { columnMetadata: columns.map(name => ({ name })),
    records: values.map(row => columns.map(name => ({ stringValue: String(row[name]) }))) };
}
function load(overrides = {}, env = {}) {
  const module = { exports: {} };
  const aws = new Proxy({}, { get: (_, name) => String(name).endsWith('Client')
    ? class { async send() { throw new Error('Unexpected AWS operation'); } }
    : class { constructor(input) { this.input = input; } } });
  const sandbox = { module, exports: module.exports, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder,
    AbortSignal, setTimeout, clearTimeout, console: { log() {}, error() {} }, overrides,
    process: { env }, fetch: async () => { throw new Error('Unexpected network operation'); },
    require(name) { if (name === 'crypto') return crypto; if (name.startsWith('@aws-sdk/')) return aws;
      if (name.startsWith('./')) return require(path.resolve(__dirname, name)); throw new Error(name); } };
  const names = ['buildRollerBookingPayload', 'normalizeDraftRequest', 'validateDraftRequest',
    'capturePhoneEmailMarketing', 'handlePhoneEmailMarketing', 'reserveIdempotencyKey'];
  const assignments = Object.keys(overrides).map(name => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8') + `\n${assignments}\nmodule.exports.test = {${names.join(',')}};`, sandbox);
  return { ...module.exports.test, handler: module.exports.handler };
}

test('phone provider payload contains neither email nor SMS instruction; kiosk and add-ons are unchanged', () => {
  const h = load();
  const request = { externalId: 'external-test', items: [], discounts: [], giftCards: [], companyId: null };
  for (const channel of [null, undefined, 'kiosk']) {
    const payload = h.buildRollerBookingPayload({ ...request, channel }, { customer, externalIdPrefix: 'JY-D' });
    assert.equal(payload.customer.email, customer.email);
    assert.equal(payload.customer.acceptMarketing, channel === 'kiosk' ? true : undefined);
    assert.equal(payload.customer.acceptMarketingSms, channel === 'kiosk' ? true : undefined);
  }
  const addon = h.buildRollerBookingPayload({ ...request, flowType: 'add_product' }, { customer, externalIdPrefix: 'JY-A' });
  assert.equal(addon.customer.acceptMarketing, true);
});

test('pending consent capture binds the returned draft and hashes email, without a provider write', async () => {
  const calls = [];
  const h = load({ executeStatement: async (sql, parameters) => { calls.push({ sql, parameters }); return {}; } });
  await h.capturePhoneEmailMarketing({ customer }, { uniqueId: id }, 'external-test', 'playground', 'test');
  assert.equal(calls.length, 0);
  await h.capturePhoneEmailMarketing({ customer, emailMarketingConsent: choice }, { uniqueId: id }, 'external-test', 'playground', 'test');
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.ok(!JSON.stringify(calls).includes(customer.email));
  const grant = JSON.parse(calls[0].parameters.find(p => p.name === 'grant').value.stringValue);
  assert.equal(grant.uniqueId, id);
  assert.equal(grant.emailHash, marketing.emailHash(customer.email));
});

test('consent capture failure does not fail payment preparation', async () => {
  const h = load({ executeStatement: async () => { throw new Error('database unavailable'); } });
  await h.capturePhoneEmailMarketing({ customer, emailMarketingConsent: choice }, { uniqueId: id }, 'external-test', 'playground', 'test');
});

test('internal worker fails closed without provider approval and rejects public HTTP invocation', async () => {
  const h = load({ isEmergencyStopEnabled: () => false, isNewBookingDraftWriteEnabled: () => true });
  assert.equal((await h.handlePhoneEmailMarketing({ rollerUniqueId: id }, 'test')).status, 'provider_not_approved');
  const result = await h.handler({ source: 'jumpyard.phone-email-marketing', detail: { rollerUniqueId: id },
    requestContext: { http: { method: 'POST' } }, rawPath: '/not-a-route', body: '{}' });
  assert.equal(result.statusCode, 404);
});

test('browser idempotency keys cannot forge consent queue records', async () => {
  const h = load();
  assert.equal((await h.reserveIdempotencyKey('booking_draft_create', 'jymc_forged', 'hash')).ok, false);
});

test('transient internal worker failure is retryable, not a successful HTTP-shaped Lambda result', async () => {
  let attempts = 0;
  const h = load({ handlePhoneEmailMarketing: async () => { attempts++; throw new Error('private provider detail'); } });
  await assert.rejects(h.handler({ source: 'jumpyard.phone-email-marketing', detail: { rollerUniqueId: id } }),
    { message: 'marketing_email_delivery_failed' });
  assert.equal(attempts, 1);
});

test('actual worker rechecks paid booking, claims once, preserves SMS and never replays', async () => {
  let status = 'pending'; const calls = [];
  const grant = marketing.createPendingGrant(choice, customer, id, 'external-test', 'playground');
  const h = load({
    isEmergencyStopEnabled: () => false, isNewBookingDraftWriteEnabled: () => true,
    getRollerConfig: async () => ({ env: 'playground', baseUrl: 'https://api.play.roller.app' }),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic', tokenType: 'Bearer' }),
    executeStatement: async (sql, parameters) => {
      if (sql.includes('SELECT status')) return rows(status === 'pending' ? [{ status, result_ref: JSON.stringify(grant) }] : []);
      if (sql.includes("SET status = 'dispatch_claimed'")) {
        if (status !== 'pending') return rows([]);
        status = 'dispatch_claimed'; return rows([{ idempotency_key: 'synthetic' }]);
      }
      if (sql.includes('SET status = :status')) status = parameters.find(p => p.name === 'status').value.stringValue;
      return {};
    },
    fetch: async (url, options) => {
      calls.push([options.method, url]);
      if (options.method === 'PUT') {
        const payload = JSON.parse(options.body);
        assert.equal(payload.acceptMarketing, true);
        assert.equal(payload.acceptMarketingSms, true);
        return { ok: true };
      }
      return { ok: true, json: async () => String(url).includes('/bookings/')
        ? { uniqueId: id, externalId: 'external-test', bookingReference: 'synthetic', customerId: 42, status: 'Paid', amountOwing: 0 }
        : { ...customer, acceptMarketing: false, acceptMarketingSMS: true } };
    },
  }, { PHONE_EMAIL_MARKETING_PROVIDER_APPROVED: 'true' });
  assert.deepEqual(plain(await h.handlePhoneEmailMarketing({ rollerUniqueId: id }, 'test')), { status: 'submitted' });
  assert.equal(status, 'submitted');
  assert.equal((await h.handlePhoneEmailMarketing({ rollerUniqueId: id }, 'test')).status, 'not_pending');
  assert.deepEqual(calls.map(call => call[0]), ['GET', 'GET', 'PUT']);
});
