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

test('draft contact requires a phone and forwards the supplied value without a default', () => {
  const policy = functions('infra/lambda/booking/index.js', ['isPlaceholderPhone', 'validateCustomer', 'buildRollerBookingPayload']);
  const customer = { firstName: 'Synthetic', lastName: 'Guest', email: 'guest@example.invalid' };
  assert.equal(policy.validateCustomer(customer).code, 'customer_required');
  assert.match(policy.validateCustomer(customer).message, /customer.phone/);
  const request = { externalId: 'synthetic', items: [], discounts: [], giftCards: [], companyId: null };
  for (const phone of ['0701234567', '+44 7700 900123']) {
    const supplied = { ...customer, phone };
    assert.equal(policy.validateCustomer(supplied), null);
    const payload = policy.buildRollerBookingPayload(request, { customer: supplied, externalIdPrefix: 'JY-D' });
    assert.equal(payload.customer.phone, phone);
    assert.equal(payload.customer.acceptMarketingSms, false);
    assert.equal(supplied.phone, phone);
  }
  // The builder must never manufacture contact data, even when used by quotes.
  const missing = policy.buildRollerBookingPayload(request, { customer, externalIdPrefix: 'JY-D' });
  assert.equal(missing.customer.phone, undefined);
  assert.ok(policy.validateCustomer({ ...customer, phone: '0701234567', email: '' }));
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
