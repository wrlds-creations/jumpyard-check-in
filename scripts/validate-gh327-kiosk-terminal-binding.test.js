const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');
const source = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const profile1 = 'nacka-forum-kiosk-1';
const profile2 = 'nacka-forum-kiosk-2';
const capability = 'A'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
function configuration() {
  return {
    env: 'playground', kioskVenueId: '50871', allowLegacyKioskTerminalAlias: false,
    kioskInstallations: contract.normalizeKioskInstallationMap({
      [installationId]: { active: true, allowedProfileIds: [profile1, profile2], venueId: '50871' },
    }),
    kioskProfiles: contract.normalizeKioskProfileMap({
      [profile1]: { active: true, paymentTerminalAlias: 'fixture-one', venueId: '50871' },
      [profile2]: { active: true, paymentTerminalAlias: 'primary', venueId: '50871' },
    }),
    paymentTerminals: contract.normalizePaymentTerminalMap({
      'fixture-one': { terminalId: 'synthetic-terminal-one', lockId: `kt_${'1'.repeat(32)}` },
      primary: { terminalId: 'synthetic-terminal-two', deviceId: 'synthetic-device', lockId: `kt_${'2'.repeat(32)}` },
    }),
  };
}
const request = (extra = {}) => ({ channel: 'kiosk', kioskInstallationId: installationId,
  kioskCapability: capability, kioskProfileId: profile1, ...extra });
function loadBackend(overrides = {}) {
  const module = { exports: {} };
  const fakeAws = new Proxy({}, { get: () => class {
    constructor(input) { this.input = input; }
    async send() { throw new Error('No AWS calls allowed in GH327 tests'); }
  } });
  const sandbox = { Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, console, crypto, module,
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
  vm.runInNewContext(source + '\n' + Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n') +
    '\nmodule.exports.tests = { handleDraft, handleAddProductDraft, reserveKioskDraftBinding, reserveIdempotencyKey, normalizeDraftRequest, validateDraftRequest, normalizeAddProductDraftRequest, validateAddProductDraftRequest };', sandbox);
  return module.exports.tests;
}

test('Both fixed profiles resolve server-side without exposing lock metadata to ROLLER', () => {
  const config = configuration();
  for (const [profile, terminal] of [[profile1, 'synthetic-terminal-one'], [profile2, 'synthetic-terminal-two']]) {
    const result = contract.resolveKioskPaymentTerminal(config, request({ kioskProfileId: profile }));
    assert.deepEqual(result.paymentTerminal, { deviceId: installationId, terminalId: terminal, promptForTip: false });
    assert.equal(result.reservationKeys.length, 2);
  }
  assert.deepEqual(contract.resolveKioskPaymentTerminal(config, {}), { enabled: false, paymentTerminal: null });
});

test('Two separately provisioned installations resolve only their assigned profiles', () => {
  const config = configuration();
  const otherCapability = 'B'.repeat(43);
  const otherId = `ki_${crypto.createHash('sha256').update(otherCapability).digest('hex').slice(0, 24)}`;
  config.kioskInstallations[installationId].allowedProfileIds = [profile1];
  config.kioskInstallations[otherId] = { active: true, allowedProfileIds: [profile2], venueId: '50871' };
  const first = contract.resolveKioskPaymentTerminal(config, request());
  const secondRequest = request({ kioskInstallationId: otherId, kioskCapability: otherCapability, kioskProfileId: profile2 });
  const second = contract.resolveKioskPaymentTerminal(config, secondRequest);
  assert.notEqual(first.paymentTerminal.terminalId, second.paymentTerminal.terminalId);
  assert.notEqual(first.paymentTerminal.deviceId, second.paymentTerminal.deviceId);
  assert.ok(contract.resolveKioskPaymentTerminal(config, request({ kioskProfileId: profile2 })).error);
  assert.ok(contract.resolveKioskPaymentTerminal(config, { ...secondRequest, kioskProfileId: profile1 }).error);
});

test('Tampering, revocation, unsupported profiles, venue mismatches and alias mixing fail closed', () => {
  const invalid = [
    { kioskCapability: 'B'.repeat(43) }, { kioskCapability: 'invalid' },
    { kioskInstallationId: `ki_${'f'.repeat(24)}` }, { kioskProfileId: 'another-profile' },
    { kioskProfileId: '__proto__' }, { venueId: 'elsewhere' }, { paymentTerminalAlias: 'primary' },
  ];
  for (const change of invalid) assert.ok(contract.resolveKioskPaymentTerminal(configuration(), request(change)).error);
  for (const mutate of [
    (c) => { c.kioskInstallations[installationId].active = false; },
    (c) => { c.kioskInstallations[installationId].allowedProfileIds = [profile2]; },
    (c) => { c.kioskProfiles[profile1].active = false; },
    (c) => { c.kioskProfiles[profile1].venueId = 'elsewhere'; },
    (c) => { c.kioskVenueId = null; },
    (c) => { delete c.paymentTerminals['fixture-one'].lockId; },
    (c) => { c.paymentTerminals.duplicate = { ...c.paymentTerminals['fixture-one'], lockId: `kt_${'3'.repeat(32)}` }; },
  ]) {
    const config = configuration(); mutate(config);
    assert.ok(contract.resolveKioskPaymentTerminal(config, request()).error);
  }
});

test('Temporary legacy compatibility is confined to primary and shares its reservation', () => {
  const config = configuration();
  assert.ok(contract.resolveKioskPaymentTerminal(config, { channel: 'kiosk', paymentTerminalAlias: 'primary' }).error);
  config.allowLegacyKioskTerminalAlias = true;
  const legacy = contract.resolveKioskPaymentTerminal(config, { channel: 'kiosk', paymentTerminalAlias: 'primary' });
  assert.equal(legacy.paymentTerminal.deviceId, 'synthetic-device');
  assert.equal(legacy.paymentTerminal.lockId, undefined);
  assert.equal(legacy.reservationKeys[0], contract.resolveKioskPaymentTerminal(config, request({ kioskProfileId: profile2 })).reservationKeys[1]);
  assert.ok(contract.resolveKioskPaymentTerminal(config, { channel: 'kiosk', paymentTerminalAlias: 'fixture-one' }).error);
});

function handlerFixture(extra = {}) {
  const calls = [];
  const body = request({ confirmDraft: true, idempotencyKey: 'fixture-request',
    customer: { firstName: 'Test', lastName: 'Fixture', email: 'test@example.invalid', phone: '+46000000000' },
    items: [{ productId: 101, quantity: 1, bookingDate: '2026-09-15', startTime: '12:00' }],
  });
  const jwt = `header.${Buffer.from(JSON.stringify({ currency: 'SEK', merchantReference: 'synthetic' })).toString('base64url')}.signature`;
  const overrides = {
    getRollerConfig: async () => configuration(), getRollerAccessToken: async () => 'synthetic-access',
    reserveIdempotencyKey: async () => ({ ok: true }), completeIdempotencyKey: async () => {},
    isNewBookingDraftWriteEnabled: () => true, isAddProductDraftWriteEnabled: () => true,
    validateT0176FullFlowRequestItemDates: () => ({ ok: true }), validateT0162AddOnSmokeAccess: () => ({ ok: true }),
    validateT0176FullFlowOriginalBookingAccess: () => ({ ok: true }), verifyGuestAccessForBooking: async () => ({ ok: true }),
    getBookingReferenceFromPath: () => 'original-fixture',
    resolveOriginalBookingContext: async () => ({ ok: true, venueId: '50871', bookingReference: 'original-fixture', rollerUniqueId: 'original-id', customer: body.customer }),
    executeStatement: async (sql, parameters) => {
      calls.push({ sql, parameters });
      const keys = JSON.parse(parameters.find((p) => p.name === 'keys').value.stringValue);
      return { columnMetadata: [{ name: 'idempotency_key' }], records: keys.map((key) => [{ stringValue: key }]) };
    },
    postRollerJson: async (_config, _token, endpoint, payload) => {
      calls.push({ endpoint, payload });
      return { ok: true, status: 200, body: { uniqueId: 'synthetic-draft', costs: { total: 10, amountOwing: 10 }, currency: 'SEK', paymentJwt: jwt } };
    },
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://example.invalid' }),
    persistPrepaymentDraft: async ({ request: saved }) => { calls.push({ saved }); return { paymentAttemptId: saved.reservedPaymentAttemptId, prepaymentDraftId: 'synthetic-prepayment' }; },
    persistAddOnBookingLink: async () => ({}), writeBookingEventLog: async () => {},
    ...extra,
  };
  return { calls, body, backend: loadBackend(overrides) };
}

for (const method of ['handleDraft', 'handleAddProductDraft']) {
  test(`${method}: authenticates, reserves before provider draft, and persists the same attempt`, async () => {
    const { calls, body, backend } = handlerFixture();
    const result = await backend[method]({}, body, 'test-correlation');
    assert.equal(result.statusCode, 201, result.body);
    const reservation = calls.findIndex((c) => c.sql);
    const creation = calls.findIndex((c) => c.endpoint === '/bookings/draft');
    assert.ok(reservation >= 0 && creation > reservation);
    assert.equal(calls[creation].payload.paymentTerminal.terminalId, 'synthetic-terminal-one');
    assert.equal(calls.find((c) => c.endpoint === '/bookings/draft/costs').payload.paymentTerminal, undefined);
    const attempt = calls[reservation].parameters.find((p) => p.name === 'attemptId').value.stringValue;
    assert.equal(calls.find((c) => c.saved).saved.reservedPaymentAttemptId, attempt);
    for (const secret of [capability, 'synthetic-terminal-one', 'kt_' + '1'.repeat(32)]) assert.ok(!result.body.includes(secret));
  });
  test(`${method}: invalid or revoked installation makes no provider call`, async () => {
    for (const change of [{ kioskCapability: 'bad' }, { venueId: 'wrong' }, { kioskProfileId: 'missing' }]) {
      const { calls, body, backend } = handlerFixture();
      const result = await backend[method]({}, { ...body, ...change }, 'test');
      assert.equal(result.statusCode, 409);
      assert.equal(calls.length, 0);
    }
  });
  test(`${method}: a busy reservation never dispatches another draft`, async () => {
    const { calls, body, backend } = handlerFixture({ reserveKioskDraftBinding: async () => ({ code: 'kiosk_payment_busy' }) });
    const result = await backend[method]({}, body, 'test');
    assert.equal(result.statusCode, 409);
    assert.ok(!calls.some((c) => c.endpoint === '/bookings/draft'));
  });
  test(`${method}: phone ecommerce keeps its existing behavior`, async () => {
    const { calls, body, backend } = handlerFixture();
    delete body.channel; delete body.kioskCapability; delete body.kioskInstallationId; delete body.kioskProfileId;
    assert.equal((await backend[method]({}, body, 'test')).statusCode, 201);
    assert.ok(!calls.some((c) => c.sql));
    assert.equal(calls.find((c) => c.endpoint === '/bookings/draft').payload.paymentTerminal, undefined);
  });
}

test('Server reservation namespace cannot be used as a guest idempotency key', async () => {
  const backend = loadBackend();
  assert.equal((await backend.reserveIdempotencyKey('booking_draft_create', 'jykb_anything', 'fixture')).ok, false);
});

test('PostgreSQL: competing kiosks, reboot, profile switch, unknown results and definitive release', {
  skip: process.env.GH327_DATABASE_TEST !== 'true',
}, async () => {
  const { Pool } = require('../infra/node_modules/pg');
  const port = Number(process.env.GH327_PGPORT || 55327);
  assert.ok([55327, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const connection = { host: '127.0.0.1', port, database: 'jumpyard_cloud',
    user: port === 55327 ? 'gh327_test' : 'gh345_test', password: '', ssl: false };
  const admin = new Pool(connection);
  const runtime = new Pool({ ...connection, max: 12, options: '-c role=jumpyard_booking_runtime' });
  const prefix = `jykb_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const executeStatement = async (sql, parameters) => {
    const indexes = new Map(parameters.map((p, i) => [p.name, i + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (m, name) => indexes.has(name) ? `$${indexes.get(name)}` : m);
    const result = await runtime.query(prepared, parameters.map((p) => p.value.stringValue ?? null));
    return { columnMetadata: result.fields.map((f) => ({ name: f.name })), records: result.rows.map((r) => result.fields.map((f) => ({ stringValue: r[f.name] }))) };
  };
  const backend = loadBackend({ executeStatement, completeIdempotencyKey: async () => {} });
  const claim = async (installation, terminal) => {
    const req = { idempotencyKey: 'synthetic-request' };
    const error = await backend.reserveKioskDraftBinding({ reservationKeys: [`${prefix}_i_${installation}`, `${prefix}_t_${terminal}`].sort() }, req);
    return { error, attempt: req.reservedPaymentAttemptId };
  };
  const setOutcome = async (attempt, outcome) => {
    await admin.query(`INSERT INTO jumpyard.prepayment_booking_drafts
      (prepayment_draft_id, external_id, idempotency_key, roller_env, payment_channel, payment_attempt_id, payment_attempt_status)
      VALUES ($1, $1, $1, 'playground', 'card_present', $2, $3)
      ON CONFLICT (prepayment_draft_id) DO UPDATE SET payment_attempt_status = EXCLUDED.payment_attempt_status`, [prefix + attempt, attempt, outcome]);
  };
  try {
    const competing = await Promise.all(Array.from({ length: 12 }, (_, i) => claim(`device${i}`, 'shared')));
    assert.equal(competing.filter((r) => !r.error).length, 1);
    const winner = competing.findIndex((r) => !r.error);
    assert.equal((await claim(`device${winner}`, 'different')).error.code, 'kiosk_payment_busy');
    assert.equal((await claim(`device${winner}`, 'shared')).error.code, 'kiosk_payment_busy');
    await setOutcome(competing[winner].attempt, 'unknown');
    assert.equal((await claim(`device${winner}`, 'different')).error.code, 'kiosk_payment_busy');
    await setOutcome(competing[winner].attempt, 'approved');
    assert.equal((await claim('replacement', 'shared')).error.code, 'kiosk_payment_busy');
    await setOutcome(competing[winner].attempt, 'reconciled');
    const next = await claim(`device${winner}`, 'different');
    assert.equal(next.error, null);
    const replacement = await claim('replacement', 'shared');
    assert.equal(replacement.error, null);
    await setOutcome(next.attempt, 'cancelled');
    assert.equal((await claim(`device${winner}`, 'third')).error, null);
    await setOutcome(replacement.attempt, 'failed');
    assert.equal((await claim('replacement', 'shared')).error, null);
    // Orphaned/expired provider requests must not become retryable by time alone.
    const orphan = await claim('orphan', 'orphan');
    assert.equal(orphan.error, null);
    await admin.query('UPDATE jumpyard.idempotency_records SET created_at = now() - interval \'100 days\' WHERE result_ref = $1', [orphan.attempt]);
    assert.equal((await claim('orphan', 'orphan')).error.code, 'kiosk_payment_busy');
    const leak = await admin.query('SELECT * FROM jumpyard.idempotency_records WHERE idempotency_key LIKE $1', [prefix + '%']);
    assert.ok(!JSON.stringify(leak.rows).includes(capability));
  } finally {
    await admin.query('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id LIKE $1', [prefix + '%']);
    await admin.query('DELETE FROM jumpyard.idempotency_records WHERE idempotency_key LIKE $1', [prefix + '%']);
    await runtime.end(); await admin.end();
  }
});
