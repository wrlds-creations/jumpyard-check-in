const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');

function functions(file, names, host = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const definitions = names.map(name => {
    const found = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?(?=\\n(?:async )?function |\\n//|$)`));
    assert.ok(found, name);
    return found[0];
  });
  return vm.runInNewContext(`${definitions.join('\n')}\n({${names.join(',')}})`, {
    stringOrNull: value => value == null || String(value).trim() === '' ? null : String(value).trim(),
    ...host,
  });
}

const variants = ['0700000000', '070 00 00 00 0', '+46700000000', '0046700000000', '+46 (0)70-000 00 00'];
for (const file of ['booking', 'webhook', 'data-sync', 'session']) {
  test(`${file} recognizes every placeholder spelling without rejecting real numbers`, () => {
    const policy = functions(`infra/lambda/${file}/index.js`, ['isPlaceholderPhone']);
    for (const number of variants) assert.equal(policy.isPlaceholderPhone(number), true, number);
    for (const number of ['0701234567', '+46701234567', null, '']) assert.equal(policy.isPlaceholderPhone(number), false);
  });
}
for (const file of ['webhook', 'data-sync']) {
  test(`${file} treats placeholder ingestion as missing contact`, () => {
    const policy = functions(`infra/lambda/${file}/index.js`, ['isPlaceholderPhone', 'normalizePhone']);
    for (const number of variants) assert.equal(policy.normalizePhone(number), null);
    assert.equal(policy.normalizePhone('+46701234567'), '+46701234567');
  });
}
test('SMS refuses placeholders from both fresh and legacy stored destinations', () => {
  const policy = functions('infra/lambda/session/index.js', ['isPlaceholderPhone', 'normalizePhoneForSms']);
  for (const number of variants) assert.equal(policy.normalizePhoneForSms(number), null);
  assert.equal(policy.normalizePhoneForSms('070 123 45 67'), '+46701234567');
});

test('phone is optional internally and defaulted only on the ROLLER payload', () => {
  const policy = functions('infra/lambda/booking/index.js', ['isPlaceholderPhone', 'validateCustomer', 'buildRollerBookingPayload']);
  const customer = { firstName: 'Synthetic', lastName: 'Guest', email: 'guest@example.invalid' };
  assert.equal(policy.validateCustomer(customer), null);
  const request = { externalId: 'synthetic', items: [], discounts: [], giftCards: [], companyId: null };
  const payload = policy.buildRollerBookingPayload(request, { customer, externalIdPrefix: 'JY-D' });
  assert.equal(payload.customer.phone, '0700000000');
  assert.equal(payload.customer.acceptMarketingSms, false);
  assert.equal(customer.phone, undefined);
  assert.ok(policy.validateCustomer({ ...customer, email: '' }));
  const real = policy.buildRollerBookingPayload(request, { customer: { ...customer, phone: '+46701234567' } });
  assert.equal(real.customer.phone, '+46701234567');
});

function resolver({ local = [], bookings = [], guests = {}, searchOk = true } = {}) {
  const calls = [];
  const policy = functions('infra/lambda/booking/index.js', ['resolvePreservedDraftCustomer'], {
    executeStatement: async (sql, parameters) => { calls.push({ sql, parameters }); return local; },
    mappedRows: value => value,
    wait: async () => {},
    stringParameter: (name, value) => ({ name, value }),
    normalizeOriginalBookingGuestDetailCustomer: value => value,
    getRollerJson: async (_config, _token, endpoint) => {
      calls.push(endpoint);
      if (endpoint.startsWith('/bookings?')) return { ok: searchOk, body: { bookings } };
      const guest = guests[endpoint.split('/').pop()];
      return { ok: Boolean(guest), body: guest };
    },
  });
  return { calls, run: customer => policy.resolvePreservedDraftCustomer({}, {}, customer) };
}

test('a returning guest keeps the live exact-email phone, ignoring stale local/submitted phone', async () => {
  const h = resolver({ local: [{ roller_customer_id: '1', phone: 'stale' }], bookings: [{ customerId: 1 }, { customerId: 2 }], guests: {
    '1': { email: 'Guest@Example.invalid', phone: '+46701234567' },
    '2': { email: 'another@example.invalid', phone: '+46707654321' },
  } });
  const request = { email: 'guest@example.invalid', phone: '0700000000', firstName: 'Guest' };
  const result = await h.run(request);
  assert.equal(result.ok, true);
  assert.equal(result.customer.phone, '+46701234567');
  assert.equal(request.phone, '0700000000');
  assert.ok(h.calls.includes('/bookings?keywords=guest%40example.invalid'));
});

test('an exact known guest with no stored phone can use the placeholder', async () => {
  const h = resolver({ bookings: [{ customerId: 1 }], guests: { '1': { email: 'guest@example.invalid', phone: null } } });
  const result = await h.run({ email: 'guest@example.invalid' });
  assert.equal(result.ok, true);
  assert.equal(result.customer.phone, null);
});

test('missing, failed, ambiguous or truncated contact evidence fails closed', async () => {
  const fixtures = [
    {}, { searchOk: false },
    { bookings: [{ customerId: 1 }], guests: {} },
    { bookings: [{ customerId: 1 }], guests: { '1': { email: 'other@example.invalid', phone: '+46701234567' } } },
    { bookings: [{ customerId: 1 }, { customerId: 2 }], guests: { '1': { email: 'guest@example.invalid' }, '2': { email: 'guest@example.invalid' } } },
    { bookings: Array.from({ length: 9 }, (_, i) => ({ customerId: i + 1 })) },
  ];
  for (const fixture of fixtures) {
    const result = await resolver(fixture).run({ email: 'guest@example.invalid' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'customer_phone_preservation_unverified');
  }
});

test('both draft handlers release failed reservations before any provider write on uncertain contact', async () => {
  for (const handler of ['handleDraft', 'handleAddProductDraft']) {
    const completed = [];
    const writes = [];
    const error = { code: 'customer_phone_preservation_unverified' };
    const customer = { firstName: 'Synthetic', lastName: 'Guest', email: 'guest@example.invalid' };
    const request = { customer, items: [], idempotencyKey: 'synthetic', requireAvailability: true };
    const ok = () => ({ ok: true });
    const policy = functions('infra/lambda/booking/index.js', [handler], {
      crypto,
      normalizeDraftRequest: () => ({ ...request }),
      normalizeAddProductDraftRequest: () => ({ ...request }),
      validateDraftRequest: () => null,
      validateAddProductDraftRequest: () => null,
      validateT0176FullFlowRequestItemDates: ok,
      validateT0176FullFlowOriginalBookingAccess: ok,
      validateT0162AddOnSmokeAccess: ok,
      verifyGuestAccessForBooking: ok,
      isNewBookingDraftWriteEnabled: () => true,
      isAddProductDraftWriteEnabled: () => true,
      getBookingReferenceFromPath: () => '166797742',
      resolveOriginalBookingContext: () => ({ ok: true, bookingReference: '166797742' }),
      resolveAddProductCustomer: () => ({ ok: true, customer }),
      hashJson: () => 'synthetic-hash',
      maskCustomerForHash: value => value,
      hashDiscountsForHash: value => value,
      hashGiftCardsForHash: value => value,
      reserveIdempotencyKey: ok,
      completeIdempotencyKey: async (...args) => completed.push(args),
      getRollerConfig: async () => ({}),
      getRollerAccessToken: async () => 'synthetic',
      resolveKioskPaymentTerminal: () => ({ enabled: true }),
      validateItemsAvailable: async () => null,
      resolvePreservedDraftCustomer: async () => ({ ok: false, error }),
      postRollerJson: async (...args) => { writes.push(args); throw new Error('Unexpected provider write'); },
      jsonResponse: (statusCode, _correlationId, body) => ({ statusCode, body }),
    });
    const result = await policy[handler]({}, {}, 'synthetic');
    assert.equal(result.statusCode, 409, handler);
    assert.equal(result.body.error.code, error.code);
    assert.deepEqual(completed, [['synthetic', 'failed', error.code]]);
    assert.deepEqual(writes, []);
  }
});

function lookupHandler() {
  const file = path.join(root, 'infra/lambda/lookup/index.js');
  const loaded = { exports: {} };
  const calls = [];
  const source = fs.readFileSync(file, 'utf8');
  vm.runInNewContext(source, {
    exports: loaded.exports, module: loaded, Buffer, TextEncoder, TextDecoder, URL, URLSearchParams,
    process: { env: {} }, console, setTimeout, clearTimeout,
    fetch: async () => { calls.push('network'); throw new Error('Unexpected external request'); },
    require(name) {
      if (name === 'crypto') return crypto;
      if (name.startsWith('@aws-sdk/')) return new Proxy({}, { get: () => class { async send() { calls.push('aws'); throw new Error('Unexpected AWS call'); } } });
      return require(path.resolve(path.dirname(file), name));
    },
  });
  return { calls, handler: loaded.exports.handler, policy: loaded.exports._internal };
}
test('public API refuses every phone spelling and forged type before AWS/provider reads', async () => {
  const h = lookupHandler();
  for (const identifier of [...variants, '0701234567', '+1 (202) 555-0123', '46701234567']) {
    for (const identifierType of [undefined, 'email', 'bookingReference', 'phone']) {
      const response = await h.handler({ body: JSON.stringify({ identifier, identifierType }) });
      assert.equal(response.statusCode, 400, identifier);
      assert.equal(JSON.parse(response.body).error.code, 'phone_lookup_disabled');
    }
  }
  const declared = await h.handler({ body: JSON.stringify({ identifier: '166797742', identifierType: 'phone' }) });
  assert.equal(declared.statusCode, 400);
  assert.deepEqual(h.calls, []);
  assert.equal(h.policy.inferIdentifierType('166797742'), 'bookingReference');
  assert.equal(h.policy.inferIdentifierType('guest@example.invalid'), 'email');
  assert.equal(h.policy.inferIdentifierType('68b3bbb4-9a46-4379-96ac-bc7157f2fb3e'), 'rollerUniqueId');
});
